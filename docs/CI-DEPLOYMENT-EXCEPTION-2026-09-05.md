# Direct-main CI deployment exception, 2026-09-05

Franz requested immediate deployment of the CI feedback improvements directly to
`main` and explicitly authorized a temporary exception to the rule preventing
direct pushes. The reason was the measured 24-minute memory job dominating
repeated PR feedback cycles while other CI jobs finished in about three minutes.

The deployment must preserve a complete snapshot of ruleset `15947577`, restrict
the temporary bypass to the `HemSoft` user, push only the validated CI change,
and restore and verify the original ruleset immediately in a `finally` block.
Do not leave a standing bypass. The ordinary PR policy in CONTRIBUTING remains
in effect after deployment. Run the new CI on the deployed revision and retain
its memory samples and combined qualification result as delivery evidence.
