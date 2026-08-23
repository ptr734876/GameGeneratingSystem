#include "PowerBudget.hpp"

#include <algorithm>
#include <cmath>

namespace game::core {

double hill_soft_cap(double value, double threshold, double maximum, double hill, double decay) noexcept {
    if (!std::isfinite(value) || !std::isfinite(threshold) || !std::isfinite(maximum) ||
        threshold <= 0.0 || maximum <= 0.0 || hill <= 0.0 || decay < 0.0) return 0.0;
    const double x = std::max(0.0, value);
    const double power = std::pow(x, hill);
    const double base = maximum * power / (std::pow(threshold, hill) + power);
    if (x <= threshold) return std::clamp(base, 0.0, maximum);
    const double soft = decay == 0.0 ? maximum : maximum * (1.0 - std::exp(-decay * (x - threshold)));
    return std::clamp(std::max(base, soft), 0.0, maximum);
}

GateResult validate_gate(const GateRequest& request) noexcept {
    const bool level = request.player_level >= request.required_level;
    const bool region = request.required_region.empty() || request.region == request.required_region;
    const bool samples = request.sample_count >= request.minimum_samples;
    return {level && region && samples, level, region, samples};
}

double BonusRatchet::grant(double calculated_bonus) noexcept {
    if (!std::isfinite(calculated_bonus)) return granted_bonus_;
    std::scoped_lock lock(mutex_);
    granted_bonus_ = std::max(granted_bonus_, calculated_bonus);
    return granted_bonus_;
}

double BonusRatchet::current() const noexcept {
    std::scoped_lock lock(mutex_);
    return granted_bonus_;
}

} // namespace game::core
