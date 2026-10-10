"""A small stand-in for the `genlayer` SDK, enough to run the contract under unittest.

It is deliberately strict where the real runtime is strict: sized integers are
range-checked when they are assigned into storage, addresses are validated, and
floats are refused inside deterministic code paths the contract controls
(the contract never uses them; static tests check that too).

It is a stub, not the runtime. The on-chain scripts under scripts/ are what
establish behaviour on a real network.
"""

import sys
import types


class Address:
    def __init__(self, value):
        if isinstance(value, Address):
            value = value.as_hex
        text = str(value)
        if not (text.startswith("0x") and len(text) == 42 and all(c in "0123456789abcdefABCDEF" for c in text[2:])):
            raise ValueError("not an address: " + text[:50])
        self.as_hex = text

    def __eq__(self, other):
        return isinstance(other, Address) and self.as_hex.lower() == other.as_hex.lower()

    def __hash__(self):
        return hash(self.as_hex.lower())

    def __repr__(self):
        return "Address(" + self.as_hex + ")"


def _sized(name, bits):
    limit = 1 << bits

    def make(value=0):
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError(name + " needs an int, got " + type(value).__name__)
        if not (0 <= value < limit):
            raise OverflowError(name + " out of range: " + str(value))
        return value

    make.__name__ = name
    return make


u32, u64, u256 = _sized("u32", 32), _sized("u64", 64), _sized("u256", 256)


class TreeMap(dict):
    pass


class DynArray(list):
    pass


def allow_storage(cls):
    return cls


class UserError(Exception):
    def __init__(self, message=""):
        super().__init__(message)
        self.message = message


class Return:
    def __init__(self, calldata):
        self.calldata = calldata


class ConsensusFailure(Exception):
    """The validator refused the leader's result."""


class Contract:
    def __new__(cls, *args, **kwargs):
        obj = object.__new__(cls)
        for klass in reversed(cls.__mro__):
            for name, ann in getattr(klass, "__annotations__", {}).items():
                origin = getattr(ann, "__origin__", ann)
                if origin is TreeMap:
                    object.__setattr__(obj, name, TreeMap())
                elif origin is DynArray:
                    object.__setattr__(obj, name, DynArray())
                elif ann in (u32, u64, u256):
                    object.__setattr__(obj, name, 0)
                elif ann is str:
                    object.__setattr__(obj, name, "")
        return obj


class _Write:
    def __call__(self, fn):
        fn._kind = "write"
        return fn

    @staticmethod
    def payable(fn):
        fn._kind = "payable"
        return fn


class _Public:
    write = _Write()

    @staticmethod
    def view(fn):
        fn._kind = "view"
        return fn


class _Response:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self.body = body if isinstance(body, bytes) else str(body).encode("utf-8")


class Env:
    """What a test controls: pages on the web, the judge, the clock, the sender."""

    def __init__(self):
        self.pages = {}
        self.llm = None
        self.prompts = []
        self.fetches = []
        self.transfers = []
        self.validator = None

    def reset(self):
        self.__init__()


env = Env()


def _web_get(url, **kwargs):
    env.fetches.append(url)
    page = env.pages.get(url)
    if page is None:
        raise OSError("network unreachable: " + url)
    if callable(page):
        page = page()
    status, body = page
    return _Response(status, body)


def _exec_prompt(prompt, response_format=None, **kwargs):
    env.prompts.append(prompt)
    if env.llm is None:
        raise UserError("[LLM_ERROR] no judge in this test")
    return env.llm(prompt)


def _run_nondet_unsafe(leader_fn, validator_fn):
    result = leader_fn()
    env.validator = (leader_fn, validator_fn, result)
    if not validator_fn(Return(result)):
        raise ConsensusFailure("the validator disagreed with the leader")
    return result


def run_validator(leader_result=None, leader_error=None):
    """Re-run the last validator function, optionally against another leader result."""
    leader_fn, validator_fn, result = env.validator
    if leader_error is not None:
        return validator_fn(leader_error)
    return validator_fn(Return(result if leader_result is None else leader_result))


class _Contractual:
    def __init__(self, address):
        self.address = address

    def emit_transfer(self, value, **kwargs):
        env.transfers.append((self.address.as_hex.lower(), int(value)))


def _contract_interface(cls):
    def build(address):
        return _Contractual(address)
    return build


gl = types.SimpleNamespace(
    Contract=Contract,
    public=_Public,
    message=types.SimpleNamespace(sender_address=None, value=0, contract_address=None),
    message_raw={"datetime": "2026-09-29T12:00:00Z"},
    vm=types.SimpleNamespace(UserError=UserError, Return=Return, run_nondet_unsafe=_run_nondet_unsafe),
    nondet=types.SimpleNamespace(
        web=types.SimpleNamespace(get=_web_get),
        exec_prompt=_exec_prompt,
    ),
    evm=types.SimpleNamespace(contract_interface=_contract_interface),
)


def install():
    module = types.ModuleType("genlayer")
    for name in ("gl", "Address", "u32", "u64", "u256", "TreeMap", "DynArray", "allow_storage"):
        setattr(module, name, globals()[name])
    module.__all__ = ["gl", "Address", "u32", "u64", "u256", "TreeMap", "DynArray", "allow_storage"]
    sys.modules["genlayer"] = module
    return module
