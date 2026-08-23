#pragma once

#include <cstddef>
#include <string_view>
#include <mutex>

namespace game::core {

[[nodiscard]] double hill_soft_cap(double value, double threshold, double maximum,
                                   double hill = 2.0, double decay = 0.15) noexcept;

struct GateRequest final {
    int player_level{};
    int required_level{};
    std::string_view region{};
    std::string_view required_region{};
    std::size_t sample_count{};
    std::size_t minimum_samples{};
};

struct GateResult final {
    bool allowed{};
    bool level_ok{};
    bool region_ok{};
    bool samples_ok{};
};

[[nodiscard]] GateResult validate_gate(const GateRequest& request) noexcept;

class BonusRatchet final {
public:
    [[nodiscard]] double grant(double calculated_bonus) noexcept;
    [[nodiscard]] double current() const noexcept;

private:
    mutable std::mutex mutex_;
    double granted_bonus_{0.0};
};

} // namespace game::core
