namespace SkillGen.Bindings.Configuration;

/// <summary>Serialization-ready engine configuration.</summary>
public sealed class SkillGenConfig
{
    public double EmaAlpha { get; set; } = 0.2;
    public uint MaxSkills { get; set; } = 64;
    public SkillGenGateConfig Gate { get; set; } = new();
    public SkillGenCurveConfig Curve { get; set; } = new();
}

public sealed class SkillGenGateConfig
{
    public int RequiredLevel { get; set; }
    public string RequiredRegion { get; set; } = string.Empty;
    public ulong MinimumSamples { get; set; } = 1;
}

public sealed class SkillGenCurveConfig
{
    public double Threshold { get; set; } = 1.0;
    public double Maximum { get; set; } = 1.0;
    public double Hill { get; set; } = 2.0;
    public double Decay { get; set; } = 0.15;
}
