Feature: Data Cache
  Persistent in-memory cache with disk backing, staleness checks,
  and subscriber notifications for cross-component reactivity.

  Scenario: Return null for missing cache keys
    Given an empty cache
    When getting a key that does not exist
    Then the result should be null

  Scenario: Store and retrieve data
    Given an empty cache
    When setting key "my-prs" with data "hello" at timestamp 1000
    Then getting key "my-prs" should return data "hello"
    And the fetchedAt should be 1000

  Scenario: Overwrite existing entries
    Given an empty cache
    When setting key "k" with data "v1" at timestamp 100
    And setting key "k" with data "v2" at timestamp 200
    Then getting key "k" should return data "v2"
    And the fetchedAt should be 200

  Scenario: Fresh entry within max age
    Given an empty cache
    And the current time is 5000
    When setting key "prs" with data "data" at timestamp 4000
    Then key "prs" should be fresh with max age 2000ms

  Scenario: Stale entry beyond max age
    Given an empty cache
    And the current time is 10000
    When setting key "prs" with data "data" at timestamp 4000
    Then key "prs" should not be fresh with max age 2000ms

  Scenario: Missing key is never fresh
    Given an empty cache
    Then key "nonexistent" should not be fresh with max age 999999ms

  Scenario: Notify subscribers on set
    Given an empty cache
    And a subscriber is listening
    When setting key "update" with data "val" at timestamp 1
    Then the subscriber should be notified with key "update"

  Scenario: Unsubscribe stops notifications
    Given an empty cache
    And a subscriber is listening
    When the subscriber unsubscribes
    And setting key "after" with data "val" at timestamp 1
    Then the subscriber should not be notified

  Scenario: Delete removes entry from cache
    Given an empty cache
    When setting key "temp" with data "value" at timestamp 1
    And deleting key "temp"
    Then getting key "temp" should be null

  Scenario: Get stats reports entry ages
    Given an empty cache
    And the current time is 120000
    When setting key "a" with data "x" at timestamp 60000
    Then stats for key "a" should show age of 60000ms
