Feature: PR Detail Routing
  Encodes pull request detail info into view IDs for the tab system
  and decodes them back, supporting optional section navigation.

  Scenario: Round-trip a PR detail view ID without section
    Given a pull request with repo "my-repo" id 42 title "Fix login"
    When a view ID is created without a section
    And the view ID is parsed back
    Then the parsed PR repository should be "my-repo"
    And the parsed PR id should be 42
    And the parsed PR title should be "Fix login"
    And the parsed section should be null

  Scenario: Round-trip a PR detail view ID with section
    Given a pull request with repo "my-repo" id 42 title "Fix login"
    When a view ID is created with section "files-changed"
    And the view ID is parsed back
    Then the parsed section should be "files-changed"

  Scenario: Parse returns null for non-PR view IDs
    Given a view ID "dashboard:main"
    When the view ID is parsed
    Then the result should be null

  Scenario: Parse returns null for empty string
    Given a view ID ""
    When the view ID is parsed
    Then the result should be null

  Scenario: Invalid section is ignored
    Given a pull request with repo "repo" id 1 title "Test"
    When a view ID is created with section "files-changed"
    And the section in the view ID is replaced with "invalid-section"
    And the view ID is parsed back
    Then the parsed section should be null

  Scenario: All valid sections are preserved
    Given a pull request with repo "repo" id 1 title "Test"
    Then view ID round-trips should preserve these sections:
      | section       |
      | conversation  |
      | commits       |
      | checks        |
      | files-changed |
      | ai-reviews    |
