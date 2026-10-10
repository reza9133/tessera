import importlib.util
import json
import os
import re

from tests import genlayer_stub as stub

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTRACT_PATH = os.environ.get("TESSERA_CONTRACT") or os.path.join(ROOT, "contracts", "tessera.py")

MAKER = "0x" + "a1" * 20
WORKER = "0x" + "b2" * 20
STRANGER = "0x" + "c3" * 20
OTHER = "0x" + "d4" * 20
GEN = 10 ** 18


def load_module():
    stub.install()
    spec = importlib.util.spec_from_file_location("tessera_under_test", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def page(title, body):
    return (200, "<html><head><title>" + title + "</title><style>p{}</style><script>x=1</script></head><body>"
            + body + "</body></html>")


def words(n, seed="lorem"):
    return " ".join(seed + str(i) for i in range(n))


def default_judge(prompt):
    """A small honest judge: a criterion is met when its longer words all occur in the evidence."""
    ev = prompt.split("<<<EVIDENCE", 1)[1].split("EVIDENCE>>>", 1)[0].lower()
    tail = prompt.split("CRITERIA:", 1)[1].split("Answer each criterion", 1)[0]
    results = []
    for cid, text in re.findall(r"- (c\d+): (.*)", tail):
        needed = [w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 4]
        hit = bool(needed) and all(w in ev for w in needed)
        quote = ""
        if hit:
            first = needed[0]
            at = ev.find(first)
            quote = ev[max(0, at - 5): at + 40]
        results.append({"id": cid, "verdict": "met" if hit else "unmet", "quote": quote})
    return {"results": results}


class World:
    def __init__(self):
        self.mod = load_module()
        stub.env.reset()
        stub.env.llm = default_judge
        self.c = self.mod.Tessera()
        self.now = "2026-09-29T12:00:00Z"
        self.received = 0
        self.paid_out = 0

    # -- calls -----------------------------------------------------------
    def call(self, who, method, *args, value=0, at=None):
        gl = self.mod.gl
        gl.message.sender_address = self.mod.Address(who)
        gl.message.value = value
        gl.message_raw["datetime"] = at or self.now
        self.received += value
        before = len(stub.env.transfers)
        out = getattr(self.c, method)(*args)
        self.paid_out += sum(t[1] for t in stub.env.transfers[before:])
        return json.loads(out) if isinstance(out, str) else out

    def read(self, method, *args):
        return json.loads(getattr(self.c, method)(*args))

    # -- helpers ---------------------------------------------------------
    @property
    def transfers(self):
        return stub.env.transfers

    def advance(self, seconds):
        base = self.mod._instant_seconds(self.now)
        t = base + seconds
        days, rem = divmod(t, 86400)
        y, m, d = civil_from_days(days)
        self.now = "%04d-%02d-%02dT%02d:%02d:%02dZ" % (y, m, d, rem // 3600, rem % 3600 // 60, rem % 60)

    def rubric(self, *items):
        return json.dumps(list(items))

    def create(self, who=MAKER, title="Landing page copy", terms="Write landing page copy for the Lumen notes app.",
               criteria=None, counterparty="", days=7, contest=0, value=5 * GEN):
        if criteria is None:
            criteria = [{"type": "live", "weight": 1, "required": True},
                        {"type": "contains", "arg": "offline mode", "weight": 2},
                        {"type": "judge", "text": "The copy explains benefits clearly", "weight": 2}]
        return self.call(who, "create_pact", title, terms, json.dumps(criteria), counterparty, days, contest,
                         value=value)

    def open_pact(self, **kw):
        res = self.create(**kw)
        assert res["ok"], res
        return res["id"]

    def active_pact(self, worker=WORKER, **kw):
        pid = self.open_pact(**kw)
        assert self.call(worker, "accept_pact", pid)["ok"]
        return pid

    def delivered_pact(self, url="https://example.com/work", worker=WORKER, **kw):
        pid = self.active_pact(worker=worker, **kw)
        assert self.call(worker, "submit_delivery", pid, url, "done")["ok"]
        return pid

    def pact(self, pid):
        return self.read("get_pact", pid)["pact"]


def civil_from_days(z):
    z += 719468
    era = (z if z >= 0 else z - 146096) // 146097
    doe = z - era * 146097
    yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
    y = yoe + era * 400
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    mp = (5 * doy + 2) // 153
    d = doy - (153 * mp + 2) // 5 + 1
    m = mp + 3 if mp < 10 else mp - 9
    return (y + (1 if m <= 2 else 0), m, d)
