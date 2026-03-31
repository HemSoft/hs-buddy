Feature: Quota Projection
  Calculates projected premium request usage, overage, and cost
  for the current GitHub Copilot billing period.

  Background:
    Given the overage cost is $0.04 per request

  Scenario: Zero usage returns zero projection
    Given an entitlement of 300 with 300 remaining
    And the billing period resets in 15 days
    When the projection is computed
    Then the projected total should be 0
    And the projected overage should be 0
    And the overage cost should be $0.00

  Scenario: Mid-cycle usage projects overage
    Given an entitlement of 300 with 100 remaining
    And the billing period is 50% elapsed
    When the projection is computed
    Then the projected total should exceed the entitlement
    And the projected overage should be greater than 0
    And the overage cost should be greater than $0.00

  Scenario: Null returned when insufficient time elapsed
    Given an entitlement of 300 with 300 remaining
    And the billing period just started
    When the projection is computed
    Then the result should be null

  Scenario: Color is green when usage is below 50%
    Given the quota usage percent is 30
    When the quota color is determined
    Then the color should be "#4ec9b0"

  Scenario: Color is yellow when usage is between 50% and 75%
    Given the quota usage percent is 60
    When the quota color is determined
    Then the color should be "#dcd34a"

  Scenario: Color is orange when usage is between 75% and 90%
    Given the quota usage percent is 80
    When the quota color is determined
    Then the color should be "#e89b3c"

  Scenario: Color is red when usage exceeds 90%
    Given the quota usage percent is 95
    When the quota color is determined
    Then the color should be "#e85d5d"

  Scenario: Color is green when percent is null
    Given the quota usage percent is null
    When the quota color is determined
    Then the color should be "#4ec9b0"
