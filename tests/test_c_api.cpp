#include "skillgen/SkillGen_C_API.h"
#include <gtest/gtest.h>
#include <cstring>

TEST(CApi, FullLifecycleUsesOnlyCAbi) {
    const SkillGen_GateRule gate{0, "", 1};
    const SkillGen_EngineConfig config{0.2, gate, 16};
    SkillGen_Context* context = skillgen_create_context(&config);
    ASSERT_NE(context, nullptr);

    EXPECT_EQ(skillgen_set_global_baseline(context, "7", 0.25, 0.1), SKILLGEN_OK);
    SkillGen_ActionEvent first{7, 1, 1.0};
    SkillGen_ActionEvent second{7, 1, 2.0};
    EXPECT_EQ(skillgen_push_action(context, &first), SKILLGEN_OK);
    EXPECT_EQ(skillgen_push_action(context, &second), SKILLGEN_OK);

    SkillGen_SkillModifier output[4]{};
    int actual_count = 0;
    EXPECT_EQ(skillgen_evaluate_skills(context, output, 4, &actual_count), SKILLGEN_OK);
    ASSERT_EQ(actual_count, 1);
    EXPECT_STREQ(output[0].action_name, "7");
    EXPECT_EQ(output[0].sample_count, 2u);
    EXPECT_GT(output[0].confidence, 0.0);

    skillgen_destroy_context(context);
}

TEST(CApi, InvalidArgumentsReturnErrors) {
    EXPECT_EQ(skillgen_push_action(nullptr, nullptr), SKILLGEN_INVALID_ARGUMENT);
    EXPECT_EQ(skillgen_evaluate_skills(nullptr, nullptr, 0, nullptr), SKILLGEN_INVALID_ARGUMENT);
    EXPECT_EQ(skillgen_set_global_baseline(nullptr, "a", 0.0, 1.0), SKILLGEN_INVALID_ARGUMENT);
}
