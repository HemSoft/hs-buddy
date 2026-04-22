Feature: PR Mapper
  Maps GitHub API pull request responses to the app-wide
  PullRequest type with safe defaults and date handling.

  Scenario: Map a complete PR with all fields
    Given a GitHub API PR response for repo "org/my-repo" number 42
    And the PR has title "Fix bug" by author "testuser"
    And the PR has state "open" with 2 approvals
    And the PR was created at "2026-01-15T10:00:00Z"
    And the PR was updated at "2026-01-16T12:00:00Z"
    When the PR is mapped to the app type for org "my-org"
    Then the mapped PR source should be "GitHub"
    And the mapped repository should be "my-repo"
    And the mapped id should be 42
    And the mapped author should be "testuser"
    And the mapped org should be "my-org"
    And the mapped date should be "2026-01-16T12:00:00Z"

  Scenario: Null createdAt produces null created date
    Given a partial PR response for repo "org/repo" number 10
    And the PR has no createdAt
    When the PR is mapped to the app type for org "org"
    Then the mapped created should be null

  Scenario: Missing updatedAt falls back to createdAt for date
    Given a partial PR response for repo "org/repo" number 10
    And the PR was created at "2026-02-01T08:00:00Z"
    And the PR has no updatedAt
    When the PR is mapped to the app type for org "org"
    Then the mapped date should be "2026-02-01T08:00:00Z"

  Scenario: Undefined counts default to zero
    Given a partial PR response for repo "org/repo" number 5
    And the PR has undefined approvalCount and assigneeCount
    When the PR is mapped to the app type for org "org"
    Then the mapped approvalCount should be 0
    And the mapped assigneeCount should be 0
    And the mapped iApproved should be false
