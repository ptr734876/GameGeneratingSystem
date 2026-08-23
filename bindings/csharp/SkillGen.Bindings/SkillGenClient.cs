using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using SkillGen.Bindings.Configuration;
using SkillGen.Bindings.Native;

namespace SkillGen.Bindings;

public sealed record Skill(string ActionId, double Value, double Confidence, ulong SampleCount);

public sealed class SkillGenClient : IDisposable
{
    private readonly SkillGenSafeHandle context;
    private readonly Dictionary<uint, string> actionNames = new();
    private readonly Dictionary<uint, double> grantedBonuses = new();
    private bool disposed;

    public SkillGenClient(SkillGenConfig? config = null)
    {
        config ??= new SkillGenConfig();
        if (config.EmaAlpha is <= 0 or > 1 || config.MaxSkills == 0)
            throw new ArgumentOutOfRangeException(nameof(config), "EMA alpha and MaxSkills must be positive.");

        var regionBytes = Encoding.UTF8.GetBytes(config.Gate.RequiredRegion + "\0");
        var region = Marshal.AllocHGlobal(regionBytes.Length);
        try
        {
            Marshal.Copy(regionBytes, 0, region, regionBytes.Length);
            var nativeConfig = new NativeMethods.EngineConfig
            {
                EmaAlpha = config.EmaAlpha,
                MaxSkills = config.MaxSkills,
                Gate = new NativeMethods.GateRule
                {
                    RequiredLevel = config.Gate.RequiredLevel,
                    RequiredRegion = region,
                    MinimumSamples = config.Gate.MinimumSamples
                }
            };
            var handle = NativeMethods.skillgen_create_context(in nativeConfig);
            if (handle == IntPtr.Zero) throw new InvalidOperationException("Native context creation failed.");
            context = new SkillGenSafeHandle(handle);
        }
        finally
        {
            Marshal.FreeHGlobal(region);
        }
    }

    public void PushAction(string actionId, float value, string[]? tags = null)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        ArgumentException.ThrowIfNullOrEmpty(actionId);
        var actionEvent = new NativeMethods.ActionEvent
        {
            ActionId = HashActionId(actionId),
            ContextTags = HashTags(tags),
            TimestampSeconds = Stopwatch.GetTimestamp() / (double)Stopwatch.Frequency
        };
        _ = value;
        actionNames[actionEvent.ActionId] = actionId;
        ThrowOnError(NativeMethods.skillgen_push_action(context.DangerousGetHandle(), in actionEvent));
    }

    public IReadOnlyList<Skill> GetActiveSkills()
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        var output = new NativeMethods.SkillModifier[256];
        for (var i = 0; i < output.Length; i++) output[i].ActionName = new byte[64];
        ThrowOnError(NativeMethods.skillgen_evaluate_skills(context.DangerousGetHandle(), output, output.Length, out var count));
        var skills = new List<Skill>(count);
        for (var i = 0; i < count; i++)
        {
            var nativeName = Encoding.ASCII.GetString(output[i].ActionName).TrimEnd('\0');
            _ = uint.TryParse(nativeName, out var nativeId);
            var name = actionNames.TryGetValue(nativeId, out var actionName) ? actionName : nativeName;
            var granted = grantedBonuses.TryGetValue(nativeId, out var previous)
                ? Math.Max(previous, output[i].Value) : output[i].Value;
            grantedBonuses[nativeId] = granted;
            skills.Add(new Skill(name, granted, output[i].Confidence, output[i].SampleCount));
        }
        return skills.AsReadOnly();
    }

    public void SetGlobalBaseline(string actionName, double mean, double standardDeviation)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        ArgumentException.ThrowIfNullOrEmpty(actionName);
        var nativeActionId = HashActionId(actionName).ToString(System.Globalization.CultureInfo.InvariantCulture);
        actionNames[HashActionId(actionName)] = actionName;
        ThrowOnError(NativeMethods.skillgen_set_global_baseline(context.DangerousGetHandle(), nativeActionId, mean, standardDeviation));
    }

    public void Dispose()
    {
        if (disposed) return;
        context.Dispose();
        disposed = true;
        GC.SuppressFinalize(this);
    }

    private static uint HashActionId(string value) => Fnv1a(value) % 256;
    private static uint HashTags(IEnumerable<string>? tags)
    {
        uint result = 0;
        if (tags is null) return result;
        foreach (var tag in tags) result |= 1u << (int)(Fnv1a(tag) % 32);
        return result;
    }
    private static uint Fnv1a(string value)
    {
        var hash = 2166136261u;
        foreach (var character in value) { hash ^= character; hash *= 16777619u; }
        return hash;
    }
    private static void ThrowOnError(int status)
    {
        if (status != 0) throw new InvalidOperationException($"SkillGen native error: {status}");
    }
}
