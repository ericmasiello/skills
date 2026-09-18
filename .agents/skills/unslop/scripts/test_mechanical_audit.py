from pathlib import Path
import sys
import unittest

repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(repo_root / ".agents" / "skills" / "unslop" / "scripts"))

import mechanical_audit


class TestMechanicalAudit(unittest.TestCase):
    def test_a1_multiple_instances_per_line(self):
        text = "First phrase — second phrase — third phrase."
        results = mechanical_audit.findings(text)
        em_dash_findings = [f for f in results if f["rule"] == 13]
        self.assertEqual(len(em_dash_findings), 2)
        self.assertEqual(em_dash_findings[0]["column"], 14)
        self.assertEqual(em_dash_findings[1]["column"], 30)

    def test_a2_title_case_headings(self):
        headings = [
            ("### In Scope", True),
            ("## 2. Problem Statement", True),
            ("## 4. Strategic Alignment", True),
            ("## Appendix A: System Context Diagram", True),
            ("# Project Charter: Earned, Not Assumed", True),
            ("## 2. Problem statement", False),
            ("# Project charter: earned, not assumed", False),
        ]
        for heading, should_match in headings:
            with self.subTest(heading=heading):
                results = mechanical_audit.findings(heading)
                r17 = [f for f in results if f["rule"] == 17]
                if should_match:
                    self.assertGreater(len(r17), 0, f"Expected match for {heading}")
                else:
                    self.assertEqual(len(r17), 0, f"Did not expect match for {heading}")

    def test_a3_en_dash_check(self):
        text = "FY26 H1–H2 and Sections 6–7"
        results = mechanical_audit.findings(text)
        r13 = [f for f in results if f["rule"] == 13]
        self.assertEqual(len(r13), 2)
        self.assertEqual(r13[0]["evidence"], "–")
        self.assertEqual(r13[1]["evidence"], "–")

    def test_a4_new_rules(self):
        res9 = mechanical_audit.findings("This is not just a tool, but also rather than only an engine.")
        self.assertTrue(any(f["rule"] == 9 for f in res9))

        res26 = mechanical_audit.findings("The substrate and north star of our flywheel.")
        r26_findings = [f for f in res26 if f["rule"] == 26]
        self.assertGreaterEqual(len(r26_findings), 3)

        res8 = mechanical_audit.findings("It serves as a base, stands as a pillar, and boasts new features.")
        r8_findings = [f for f in res8 if f["rule"] == 8]
        self.assertGreaterEqual(len(r8_findings), 3)

    def test_a5_false_positives_tables_and_placeholders(self):
        table_text = "| **Header 1** | **Header 2** |\n| **Label** | Normal value |"
        res_table = mechanical_audit.findings(table_text)
        self.assertEqual([f for f in res_table if f["rule"] == 15], [])

        placeholder_text = "Here is [PLACEHOLDER: insert date here] and [CONFIRM: check value]."
        res_ph = mechanical_audit.findings(placeholder_text)
        self.assertEqual([f for f in res_ph if f["rule"] == 14], [])

        heading_text = "## Context: Background information"
        res_hd = mechanical_audit.findings(heading_text)
        self.assertEqual([f for f in res_hd if f["rule"] == 14], [])

        lead_in_text = "**Schema in TypeScript.** Tables live in one file."
        res_li = mechanical_audit.findings(lead_in_text)
        self.assertEqual([f for f in res_li if f["rule"] == 15], [])

    def test_fenced_code_blocks_ignored(self):
        code_text = "```\nfoo — bar\nsubstrate\n```"
        results = mechanical_audit.findings(code_text)
        self.assertEqual(results, [])


if __name__ == "__main__":
    unittest.main()
