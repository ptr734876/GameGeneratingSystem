using SkillGen.Bindings;
using SkillGen.Bindings.Configuration;
using Xunit;

namespace SkillGen.Tests;

public sealed class SkillGenClientTests
{
    [Fact]
    public void PushActionProducesActiveSkill()
    {
        using var client = new SkillGenClient(new SkillGenConfig
        {
            MaxSkills = 64,
            Gate = new SkillGenGateConfig { MinimumSamples = 1 }
        });

        client.PushAction("heavy_attack", 1.0f, ["combat", "close_range"]);
        var skills = client.GetActiveSkills();

        var skill = Assert.Single(skills);
        Assert.NotEqual("", skill.ActionId);
        Assert.Equal((ulong)1, skill.SampleCount);
        Assert.True(skill.Confidence > 0.0);
        Assert.True(skill.Value >= 0.0);
    }

    [Fact]
    public void InvalidConfigurationIsRejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new SkillGenClient(new SkillGenConfig { EmaAlpha = 0.0 }));
    }
}
