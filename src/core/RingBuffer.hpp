#pragma once

#include <array>
#include <cstddef>
#include <optional>
#include <type_traits>
#include <utility>

namespace game::core {

/// Fixed-capacity FIFO. It overwrites the oldest item when full and never allocates.
template <typename T, std::size_t Capacity>
class RingBuffer final {
    static_assert(Capacity > 0);

public:
    [[nodiscard]] constexpr std::size_t size() const noexcept { return size_; }
    [[nodiscard]] constexpr bool empty() const noexcept { return size_ == 0; }
    [[nodiscard]] constexpr bool full() const noexcept { return size_ == Capacity; }
    [[nodiscard]] constexpr std::size_t capacity() const noexcept { return Capacity; }

    template <typename U>
    void push(U&& value) noexcept(std::is_nothrow_assignable_v<T&, U&&>) {
        storage_[write_] = std::forward<U>(value);
        write_ = (write_ + 1) % Capacity;
        if (size_ == Capacity) {
            read_ = (read_ + 1) % Capacity;
        } else {
            ++size_;
        }
    }

    [[nodiscard]] std::optional<T> pop() noexcept(std::is_nothrow_move_constructible_v<T>) {
        if (empty()) return std::nullopt;
        T result = std::move(storage_[read_]);
        read_ = (read_ + 1) % Capacity;
        --size_;
        return result;
    }

    [[nodiscard]] const T* front() const noexcept { return empty() ? nullptr : &storage_[read_]; }
    [[nodiscard]] const T& at(std::size_t offset) const noexcept {
        return storage_[(read_ + offset) % Capacity];
    }

private:
    std::array<T, Capacity> storage_{};
    std::size_t read_{0};
    std::size_t write_{0};
    std::size_t size_{0};
};

} // namespace game::core
