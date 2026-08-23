#pragma once

#include "RingBuffer.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <mutex>

namespace game::core {

struct ActionEvent final {
    std::uint32_t action_id{};
    std::uint32_t context_tags{};
    double timestamp_seconds{};
};

struct ActionMetrics final {
    double frequency_ema{};
    double interval_ema{};
    std::uint64_t count{};
};

struct Combo final {
    std::array<std::uint32_t, 3> actions{};
    std::uint8_t length{};
    std::uint32_t required_context{};
};

class TelemetryTracker final {
public:
    static constexpr std::size_t MaxActions = 256;
    static constexpr std::size_t EventCapacity = 4096;
    static constexpr std::size_t MaxCombos = 64;

    explicit TelemetryTracker(double alpha = 0.2) noexcept;

    /// Thread-safe and allocation-free after construction.
    void process(ActionEvent event) noexcept;
    [[nodiscard]] ActionMetrics metrics(std::uint32_t action_id) const noexcept;
    [[nodiscard]] std::size_t event_count() const noexcept;
    [[nodiscard]] std::uint64_t combo_hits(std::size_t combo_index) const noexcept;

    /// Registers a combo in fixed storage. Returns false when full or invalid.
    bool add_combo(Combo combo) noexcept;

private:
    mutable std::mutex mutex_;
    RingBuffer<ActionEvent, EventCapacity> events_;
    std::array<ActionMetrics, MaxActions> metrics_{};
    std::array<double, MaxActions> last_timestamp_{};
    std::array<bool, MaxActions> seen_{};
    std::array<Combo, MaxCombos> combos_{};
    std::array<std::uint64_t, MaxCombos> combo_hits_{};
    std::array<std::uint32_t, 3> recent_actions_{};
    std::array<std::uint32_t, 3> recent_contexts_{};
    std::size_t recent_size_{0};
    std::size_t combo_count_{0};
    double alpha_;
};

} // namespace game::core
