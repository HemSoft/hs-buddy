Feature: Task Queue
  Manages async task execution with configurable concurrency,
  priority ordering, and clean cancellation via AbortSignal.

  Scenario: Execute tasks serially by default
    Given a task queue with default options
    When 3 tasks are enqueued
    Then tasks should execute one at a time in FIFO order

  Scenario: Run tasks concurrently when configured
    Given a task queue with concurrency of 2
    When 3 tasks are enqueued
    Then at most 2 tasks should run simultaneously

  Scenario: Higher priority tasks execute first
    Given a task queue with concurrency of 1
    And a running task is occupying the queue
    When a low-priority task and a high-priority task are enqueued
    And the running task completes
    Then the high-priority task should execute before the low-priority task

  Scenario: Cancel a pending task
    Given a task queue with concurrency of 1
    And a running task is occupying the queue
    And a second task is pending
    When the pending task is cancelled
    Then its promise should reject with "Task cancelled"
    And the cancelled task should never execute

  Scenario: Abort signal sent to running task on cancel
    Given a task queue with concurrency of 1
    And a task is running that checks its abort signal
    When the running task is cancelled
    Then the abort signal should be triggered
