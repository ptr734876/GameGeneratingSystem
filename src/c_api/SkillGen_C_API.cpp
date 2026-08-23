#include "skillgen/SkillGen_C_API.h"
#include "core/PowerBudget.hpp"
#include "core/TelemetryTracker.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <exception>
#include <limits>
#include <string>

struct SkillGen_Context final {
    explicit SkillGen_Context(const SkillGen_EngineConfig& value)
        : tracker(value.ema_alpha), config(value) {}

    game::core::TelemetryTracker tracker;
    SkillGen_EngineConfig config{};
    struct Baseline { std::array<char, 64> name{}; double mean{}; double std_dev{1.0}; bool used{}; };
    std::array<Baseline, game::core::TelemetryTracker::MaxActions> baselines{};
};

namespace {
int valid_config(const SkillGen_EngineConfig& config) noexcept {
    return config.ema_alpha > 0.0 && config.ema_alpha <= 1.0 && config.max_skills > 0 &&
           config.max_skills <= game::core::TelemetryTracker::MaxActions;
}

SkillGen_Context::Baseline* find_baseline(SkillGen_Context& ctx, const char* name) noexcept {
    for (auto& baseline : ctx.baselines) {
        if (baseline.used && std::strncmp(baseline.name.data(), name, baseline.name.size()) == 0) return &baseline;
    }
    return nullptr;
}
}

extern "C" {

SKILLGEN_API SkillGen_Context* skillgen_create_context(const SkillGen_EngineConfig* config) {
    try {
        if (config == nullptr || !valid_config(*config)) return nullptr;
        return new SkillGen_Context(*config);
    } catch (...) {
        return nullptr;
    }
}

SKILLGEN_API void skillgen_destroy_context(SkillGen_Context* ctx) {
    try { delete ctx; } catch (...) {}
}

SKILLGEN_API int skillgen_push_action(SkillGen_Context* ctx, const SkillGen_ActionEvent* event) {
    try {
        if (ctx == nullptr || event == nullptr || !std::isfinite(event->timestamp_seconds)) return SKILLGEN_INVALID_ARGUMENT;
        ctx->tracker.process({event->action_id, event->context_tags, event->timestamp_seconds});
        return SKILLGEN_OK;
    } catch (...) { return SKILLGEN_INTERNAL_ERROR; }
}

SKILLGEN_API int skillgen_evaluate_skills(SkillGen_Context* ctx, SkillGen_SkillModifier* out_skills,
                                          int max_count, int* actual_count) {
    try {
        if (ctx == nullptr || out_skills == nullptr || actual_count == nullptr || max_count < 0) return SKILLGEN_INVALID_ARGUMENT;
        *actual_count = 0;
        const int result_limit = std::min(max_count, static_cast<int>(ctx->config.max_skills));
        for (int action = 0; action < static_cast<int>(game::core::TelemetryTracker::MaxActions) &&
                    *actual_count < result_limit; ++action) {
            const auto metrics = ctx->tracker.metrics(static_cast<std::uint32_t>(action));
            if (metrics.count < ctx->config.gate.minimum_samples) continue;
            auto& output = out_skills[*actual_count];
            std::memset(&output, 0, sizeof(output));
            const auto baseline = find_baseline(*ctx, std::to_string(action).c_str());
            const double mean = baseline == nullptr ? 0.0 : baseline->mean;
            const double deviation = baseline == nullptr ? 1.0 : baseline->std_dev;
            std::snprintf(output.action_name, sizeof(output.action_name), "%d", action);
            output.value = game::core::hill_soft_cap(metrics.frequency_ema, std::max(0.001, mean + deviation), 1.0);
            output.confidence = std::min(1.0, static_cast<double>(metrics.count) /
                                                std::max<std::uint64_t>(1, ctx->config.gate.minimum_samples));
            output.sample_count = metrics.count;
            ++*actual_count;
        }
        return SKILLGEN_OK;
    } catch (...) { return SKILLGEN_INTERNAL_ERROR; }
}

SKILLGEN_API int skillgen_set_global_baseline(SkillGen_Context* ctx, const char* action_name,
                                               double mean, double std_dev) {
    try {
        if (ctx == nullptr || action_name == nullptr || action_name[0] == '\0' || !std::isfinite(mean) ||
            !std::isfinite(std_dev) || std_dev < 0.0) return SKILLGEN_INVALID_ARGUMENT;
        auto* baseline = find_baseline(*ctx, action_name);
        if (baseline == nullptr) {
            for (auto& candidate : ctx->baselines) {
                if (!candidate.used) { baseline = &candidate; candidate.used = true; break; }
            }
        }
        if (baseline == nullptr || std::strlen(action_name) >= baseline->name.size()) return SKILLGEN_CAPACITY_EXCEEDED;
        std::strncpy(baseline->name.data(), action_name, baseline->name.size() - 1);
        baseline->name.back() = '\0'; baseline->mean = mean; baseline->std_dev = std_dev;
        return SKILLGEN_OK;
    } catch (...) { return SKILLGEN_INTERNAL_ERROR; }
}

}
