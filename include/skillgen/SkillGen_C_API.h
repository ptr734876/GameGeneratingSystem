#ifndef SKILLGEN_C_API_H
#define SKILLGEN_C_API_H

#include <stdint.h>

#if defined(_WIN32) && defined(SKILLGEN_BUILD_SHARED)
#  if defined(SKILLGEN_BUILDING_LIBRARY)
#    define SKILLGEN_API __declspec(dllexport)
#  else
#    define SKILLGEN_API __declspec(dllimport)
#  endif
#elif defined(__GNUC__) || defined(__clang__)
#  define SKILLGEN_API __attribute__((visibility("default")))
#else
#  define SKILLGEN_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef struct SkillGen_Context SkillGen_Context;

typedef struct SkillGen_ActionEvent {
    uint32_t action_id;
    uint32_t context_tags;
    double timestamp_seconds;
} SkillGen_ActionEvent;

typedef struct SkillGen_SkillModifier {
    char action_name[64];
    double value;
    double confidence;
    uint64_t sample_count;
} SkillGen_SkillModifier;

typedef struct SkillGen_GateRule {
    int32_t required_level;
    const char* required_region;
    uint64_t minimum_samples;
} SkillGen_GateRule;

typedef struct SkillGen_EngineConfig {
    double ema_alpha;
    SkillGen_GateRule gate;
    uint32_t max_skills;
} SkillGen_EngineConfig;

enum SkillGen_Status {
    SKILLGEN_OK = 0,
    SKILLGEN_INVALID_ARGUMENT = 1,
    SKILLGEN_CAPACITY_EXCEEDED = 2,
    SKILLGEN_GATE_DENIED = 3,
    SKILLGEN_INTERNAL_ERROR = 255
};

SKILLGEN_API SkillGen_Context* skillgen_create_context(const SkillGen_EngineConfig* config);
SKILLGEN_API void skillgen_destroy_context(SkillGen_Context* ctx);
SKILLGEN_API int skillgen_push_action(SkillGen_Context* ctx, const SkillGen_ActionEvent* event);
SKILLGEN_API int skillgen_evaluate_skills(SkillGen_Context* ctx, SkillGen_SkillModifier* out_skills,
                                         int max_count, int* actual_count);
SKILLGEN_API int skillgen_set_global_baseline(SkillGen_Context* ctx, const char* action_name,
                                              double mean, double std_dev);

#ifdef __cplusplus
}
#endif

#endif
