#include "TelemetryTracker.hpp"

#include <algorithm>
#include <cmath>

namespace game::core {

TelemetryTracker::TelemetryTracker(double alpha) noexcept
    : alpha_(std::clamp(alpha, 0.0, 1.0)) {}

void TelemetryTracker::process(ActionEvent event) noexcept {
    std::scoped_lock lock(mutex_);
    events_.push(event);
    if (event.action_id < MaxActions) {
        auto& metric = metrics_[event.action_id];
        const double interval = seen_[event.action_id]
            ? std::max(0.0, event.timestamp_seconds - last_timestamp_[event.action_id]) : 0.0;
        metric.frequency_ema = seen_[event.action_id]
            ? alpha_ * 1.0 + (1.0 - alpha_) * metric.frequency_ema : 1.0;
        metric.interval_ema = seen_[event.action_id]
            ? alpha_ * interval + (1.0 - alpha_) * metric.interval_ema : 0.0;
        ++metric.count;
        last_timestamp_[event.action_id] = event.timestamp_seconds;
        seen_[event.action_id] = true;
    }

    if (recent_size_ < 3) {
        recent_actions_[recent_size_] = event.action_id;
        recent_contexts_[recent_size_] = event.context_tags;
        ++recent_size_;
    } else {
        recent_actions_[0] = recent_actions_[1]; recent_actions_[1] = recent_actions_[2];
        recent_contexts_[0] = recent_contexts_[1]; recent_contexts_[1] = recent_contexts_[2];
        recent_actions_[2] = event.action_id; recent_contexts_[2] = event.context_tags;
    }
    for (std::size_t i = 0; i < combo_count_; ++i) {
        const auto& combo = combos_[i];
        if (combo.length == 0 || combo.length > recent_size_) continue;
        const auto offset = recent_size_ - combo.length;
        bool match = true;
        for (std::size_t j = 0; j < combo.length; ++j) {
            match = match && recent_actions_[offset + j] == combo.actions[j];
            match = match && (combo.required_context == 0 ||
                              (recent_contexts_[offset + j] & combo.required_context) == combo.required_context);
        }
        if (match) ++combo_hits_[i];
    }
}

ActionMetrics TelemetryTracker::metrics(std::uint32_t action_id) const noexcept {
    std::scoped_lock lock(mutex_);
    return action_id < MaxActions ? metrics_[action_id] : ActionMetrics{};
}

std::size_t TelemetryTracker::event_count() const noexcept {
    std::scoped_lock lock(mutex_);
    return events_.size();
}

std::uint64_t TelemetryTracker::combo_hits(std::size_t combo_index) const noexcept {
    std::scoped_lock lock(mutex_);
    return combo_index < combo_count_ ? combo_hits_[combo_index] : 0;
}

bool TelemetryTracker::add_combo(Combo combo) noexcept {
    std::scoped_lock lock(mutex_);
    if (combo_count_ == MaxCombos || combo.length < 2 || combo.length > 3) return false;
    combos_[combo_count_] = combo;
    combo_hits_[combo_count_] = 0;
    ++combo_count_;
    return true;
}

} // namespace game::core
