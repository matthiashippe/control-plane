"""The one reader of arguments for ops/before-the-answers.py and ops/post-the-answers.py.

There were two, one in each script, and they drifted: the gate took `--folder=<dir>`, the poster only
`--folder <dir>`, and `ops/post-the-answers.py --folder=goals/kanal/antworten` fell back silently to
the default folder while the gate it called judged the other one. Two copies of a parser are two
answers to "which drafts go out", so there is one copy, and every argument it does not know stops
the run with exit 1 before either script touches the network.

    parse(argv, accepts={"--folder", "--send", ...}, numbers=True)

`--folder`, `--send`, `--only` and `--approved` take a value as `--flag value` or `--flag=value`, the
same for each. `--approved 335:<sha12>,373:<sha12>` is the approval of exactly the texts the dry run
showed (kanal 04); only ops/post-the-answers.py accepts it, the gate refuses it like any argument it
does not know. `--selftest` and `--verify-posted` take none. Bare issue numbers are only read where the
caller says so (`numbers=True`); anywhere else they are an unknown argument like any other.
"""
from __future__ import annotations

import dataclasses
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_FOLDER = pathlib.Path(".scratch/gtm/issue-antworten")

VALUED = ("--folder", "--send", "--only", "--approved")
SWITCHES = ("--selftest", "--verify-posted")

EXAMPLES = {
    "--folder": "--folder needs a folder in the repository, e.g. --folder goals/kanal/antworten",
    "--send": "--send needs a number. `--send 3` sends three; `--send` alone sends nothing.",
    "--only": "--only needs a comma-separated list of issue numbers, e.g. --only 335,373,385",
    "--approved": "--approved needs <issue>:<12 hex digits> for every draft to send, as the dry run prints it, "
                  "e.g. --approved 335:0123456789ab,373:abcdef012345",
}
APPROVAL = re.compile(r"#?(\d+):([0-9a-f]{12})")


@dataclasses.dataclass
class Args:
    folder: pathlib.Path = DEFAULT_FOLDER
    folder_given: str | None = None
    send: int = 0
    only: list[str] = dataclasses.field(default_factory=list)
    selftest: bool = False
    verify_posted: bool = False
    # issue number -> the first 12 hex digits of sha256 over the body the dry run showed, in the order given
    approved: dict[str, str] = dataclasses.field(default_factory=dict)
    numbers: list[str] = dataclasses.field(default_factory=list)

    def folder_args(self) -> list[str]:
        """The folder as the gate has to be told it, so the gate judges the drafts that are posted."""
        return ["--folder", str(self.folder)] if self.folder_given is not None else []


def refuse(reason: str) -> None:
    print(f"\nREFUSED: {reason}")
    raise SystemExit(1)


def parse(argv: list[str], accepts: set[str], numbers: bool = False) -> Args:
    unknown = [f for f in accepts if f not in VALUED + SWITCHES]
    if unknown:
        raise ValueError(f"answers_args does not know {', '.join(unknown)}")
    out = Args()
    seen: set[str] = set()
    i = 0
    while i < len(argv):
        a = argv[i]
        name, eq, inline = a.partition("=")
        if name in accepts and name in VALUED:
            if eq:
                value = inline
                i += 1
            else:
                value = argv[i + 1] if i + 1 < len(argv) else ""
                i += 2
            if not value or value.startswith("--"):
                refuse(EXAMPLES[name])
            if name in seen:
                refuse(f"{name} is given twice")
            seen.add(name)
            if name == "--folder":
                out.folder_given = value
            elif name == "--send":
                if not value.isdigit():
                    refuse(EXAMPLES[name])
                out.send = int(value)
            elif name == "--only":
                out.only = [n.strip().lstrip("#") for n in value.split(",") if n.strip()]
                if not out.only or not all(n.isdigit() for n in out.only):
                    refuse(EXAMPLES[name])
            else:
                for item in value.split(","):
                    m = APPROVAL.fullmatch(item.strip())
                    if not m:
                        refuse(EXAMPLES[name])
                    if m.group(1) in out.approved:
                        refuse(f"#{m.group(1)} is approved twice")
                    out.approved[m.group(1)] = m.group(2)
            continue
        if a in accepts and a in SWITCHES:
            if a == "--selftest":
                out.selftest = True
            else:
                out.verify_posted = True
            i += 1
            continue
        if numbers and a.lstrip("#").isdigit():
            out.numbers.append(a.lstrip("#"))
            i += 1
            continue
        refuse(f"unknown argument {a}")

    if out.folder_given is not None:
        # A folder that is named and missing, or that lies outside the repository, refuses: a typo
        # would otherwise find no drafts and print the green "No drafts to check.", and a gate that
        # goes green on a typo is not a gate.
        path = pathlib.Path(out.folder_given).resolve()
        if not path.is_relative_to(ROOT):
            refuse(f"--folder {out.folder_given} is outside the repository ({ROOT})")
        if not path.is_dir():
            refuse(f"--folder {out.folder_given} is not a folder")
        out.folder = path
    return out
