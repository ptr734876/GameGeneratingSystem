#include "core/PowerBudget.hpp"
#include "core/RingBuffer.hpp"
#include "core/TelemetryTracker.hpp"
#include <gtest/gtest.h>
#include <chrono>
#include <cstdint>

using namespace game::core;

TEST(RingBuffer, OverwritesOldestOnOverflow) {
    RingBuffer<int, 2> buffer;
    buffer.push(1); buffer.push(2); buffer.push(3);
    ASSERT_EQ(buffer.size(), 2u);
    EXPECT_EQ(*buffer.front(), 2);
    EXPECT_EQ(*buffer.pop(), 2);
    EXPECT_EQ(*buffer.pop(), 3);
    EXPECT_TRUE(buffer.empty());
}

TEST(TelemetryTracker, SlidingEmaAndInterval) {
    TelemetryTracker tracker(0.5);
    tracker.process({7, 1, 1.0});
    tracker.process({7, 1, 3.0});
    const auto metrics = tracker.metrics(7);
    EXPECT_DOUBLE_EQ(metrics.frequency_ema, 1.0);
    EXPECT_DOUBLE_EQ(metrics.interval_ema, 1.0);
    EXPECT_EQ(metrics.count, 2u);
}

TEST(TelemetryTracker, ContextAwareNgram) {
    TelemetryTracker tracker;
    ASSERT_TRUE(tracker.add_combo({{{1, 2, 3}}, 3, 0x02}));
    tracker.process({1, 0x02, 0.0});
    tracker.process({2, 0x02, 1.0});
    tracker.process({3, 0x02, 2.0});
    EXPECT_EQ(tracker.combo_hits(0), 1u);
}

TEST(PowerBudget, SaturationIsBounded) {
    EXPECT_DOUBLE_EQ(hill_soft_cap(0.0, 10.0, 100.0), 0.0);
    EXPECT_LE(hill_soft_cap(1e9, 10.0, 100.0), 100.0);
    EXPECT_GT(hill_soft_cap(1e9, 10.0, 100.0), 99.999);
}

TEST(PowerBudget, GateChecksAllRequirements) {
    const auto denied = validate_gate({4, 5, "north", "south", 10, 20});
    EXPECT_FALSE(denied.allowed);
    EXPECT_FALSE(denied.level_ok);
    EXPECT_FALSE(denied.region_ok);
    EXPECT_FALSE(denied.samples_ok);
    EXPECT_TRUE(validate_gate({5, 5, "north", "north", 20, 20}).allowed);
}

TEST(PowerBudget, BonusRatchetNeverDegrades) {
    BonusRatchet ratchet;
    EXPECT_DOUBLE_EQ(ratchet.grant(0.8), 0.8);
    EXPECT_DOUBLE_EQ(ratchet.grant(0.2), 0.8);
    EXPECT_DOUBLE_EQ(ratchet.grant(0.9), 0.9);
}

TEST(Performance, TenThousandEventsUnderTwoMilliseconds) {
    TelemetryTracker tracker;
    const auto begin = std::chrono::steady_clock::now();
    for (std::uint32_t i = 0; i < 10'000; ++i) tracker.process({i % 32, 1, static_cast<double>(i)});
    const auto elapsed = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - begin).count();
    EXPECT_LT(elapsed, 2.0) << "Elapsed: " << elapsed << " ms";
}
