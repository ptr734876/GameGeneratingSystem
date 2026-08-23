using System.Runtime.InteropServices;

namespace SkillGen.Bindings.Native;

internal static partial class NativeMethods
{
    private const string LibraryName = "libskillgen_c_api";

    [StructLayout(LayoutKind.Sequential)]
    internal struct ActionEvent
    {
        internal uint ActionId;
        internal uint ContextTags;
        internal double TimestampSeconds;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct SkillModifier
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64, ArraySubType = UnmanagedType.I1)]
        internal byte[] ActionName;
        internal double Value;
        internal double Confidence;
        internal ulong SampleCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct GateRule
    {
        internal int RequiredLevel;
        internal IntPtr RequiredRegion;
        internal ulong MinimumSamples;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct EngineConfig
    {
        internal double EmaAlpha;
        internal GateRule Gate;
        internal uint MaxSkills;
    }

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.SysInt)]
    internal static extern IntPtr skillgen_create_context(in EngineConfig config);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
    internal static extern void skillgen_destroy_context(IntPtr context);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
    internal static extern int skillgen_push_action(IntPtr context, in ActionEvent actionEvent);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
    internal static extern int skillgen_evaluate_skills(IntPtr context, [In, Out] SkillModifier[] output,
        int maxCount, out int actualCount);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl, ExactSpelling = true,
        CharSet = CharSet.Ansi)]
    internal static extern int skillgen_set_global_baseline(IntPtr context, string actionName,
        double mean, double stdDev);
}

internal sealed class SkillGenSafeHandle : SafeHandle
{
    internal SkillGenSafeHandle(IntPtr handle) : base(IntPtr.Zero, true) => SetHandle(handle);
    public override bool IsInvalid => handle == IntPtr.Zero;
    protected override bool ReleaseHandle()
    {
        NativeMethods.skillgen_destroy_context(handle);
        return true;
    }
}
