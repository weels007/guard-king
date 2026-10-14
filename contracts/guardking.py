# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from genlayer import *

ERROR_EXPECTED = "[EXPECTED]"
ERROR_LLM = "[LLM_ERROR]"

MAX_TEXT_LEN = 5000
MAX_REASON_LEN = 2000
MAX_NOTE_LEN = 2000
MAX_ARTICLES = 30
MAX_WINDOW_SEC = 7776000  # 90 days: bounds how long funds can stay reserved


@gl.evm.contract_interface
class _EoaPayout:
    class View:
        pass

    class Write:
        pass


def _now() -> int:
    # Deterministic tx timestamp: identical for leader and validators.
    return int(datetime.now(timezone.utc).timestamp())


def _clean_json(text: str) -> dict:
    if not isinstance(text, str):
        raise gl.vm.UserError(f"{ERROR_LLM} LLM returned non-string: {type(text)}")
    cleaned = text.replace("```json", "").replace("```", "").strip()
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first < 0 or last <= first:
        raise gl.vm.UserError(f"{ERROR_LLM} No JSON object in LLM output")
    try:
        parsed = json.loads(cleaned[first : last + 1])
    except Exception as e:
        raise gl.vm.UserError(f"{ERROR_LLM} Unparsable LLM JSON: {e}")
    if not isinstance(parsed, dict):
        raise gl.vm.UserError(f"{ERROR_LLM} LLM JSON is not an object")
    return parsed


def _parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        low = value.strip().lower()
        if low in ("true", "yes", "compliant", "pass", "passed", "1"):
            return True
        if low in ("false", "no", "violation", "violated", "fail", "failed", "0"):
            return False
    raise gl.vm.UserError(f"{ERROR_LLM} Non-boolean compliant flag: {value}")


def _parse_severity(value) -> int:
    if value is None:
        raise gl.vm.UserError(f"{ERROR_LLM} Missing 'severity' in LLM output")
    try:
        severity = int(round(float(str(value).strip())))
    except (ValueError, TypeError):
        raise gl.vm.UserError(f"{ERROR_LLM} Non-numeric severity: {value}")
    if severity < 0:
        return 0
    if severity > 100:
        return 100
    return severity


def _norm_id(value) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _parse_violated(value) -> list:
    if value is None:
        return []
    if isinstance(value, str):
        value = [value] if value.strip() else []
    if not isinstance(value, list):
        raise gl.vm.UserError(f"{ERROR_LLM} 'violated' is not a list")
    out = []
    for v in value:
        norm = _norm_id(v)
        if norm and norm not in out:
            out.append(norm)
    return out


def _handle_leader_error(leaders_res, leader_fn) -> bool:
    leader_msg = leaders_res.message if hasattr(leaders_res, "message") else ""
    try:
        leader_fn()
        return False
    except gl.vm.UserError as e:
        validator_msg = e.message if hasattr(e, "message") else str(e)
        if validator_msg.startswith(ERROR_EXPECTED):
            return validator_msg == leader_msg
        return False
    except Exception:
        return False


@allow_storage
@dataclass
class Proposal:
    proposal_id: str
    proposer: Address
    title: str
    body: str
    action_json: str
    rationale: str
    charter_version: u256
    status: str
    appeal_count: u256
    executed: bool
    verdict_time: u256
    execute_after: u256
    appeal_note: str
    window_sec: u256


@allow_storage
@dataclass
class Verdict:
    compliant: bool
    violated_json: str
    severity: u256
    reason: str


class GuardKing(gl.Contract):
    owner: Address
    charters: DynArray[str]
    proposal_ids: DynArray[str]
    proposals: TreeMap[str, Proposal]
    verdicts: TreeMap[str, Verdict]
    reserved: u256

    def __init__(self):
        self.owner = gl.message.sender_address

    @gl.public.write
    def publish_charter(self, articles_json: str) -> dict:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only charter owner can publish")
        try:
            articles = json.loads(articles_json)
        except Exception:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} articles_json is not valid JSON")
        if not isinstance(articles, list) or len(articles) == 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} articles must be a non-empty JSON list")
        if len(articles) > MAX_ARTICLES:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Too many articles")
        seen = []
        for a in articles:
            if not isinstance(a, dict):
                raise gl.vm.UserError(f"{ERROR_EXPECTED} Each article must be an object")
            aid = str(a.get("id", "")).strip()
            title = str(a.get("title", "")).strip()
            text = str(a.get("text", "")).strip()
            if not aid or not title or not text:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} Each article needs id, title, text")
            if len(text) > MAX_TEXT_LEN:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} Article text too long")
            if _norm_id(aid) in seen:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} Duplicate article id")
            seen.append(_norm_id(aid))
        self.charters.append(json.dumps(articles))
        version = len(self.charters) - 1
        return {"version": version, "articles": len(articles)}

    @gl.public.write
    def submit_proposal(
        self,
        proposal_id: str,
        title: str,
        body: str,
        action_json: str,
        rationale: str,
        window_sec: u256,
    ) -> None:
        pid = proposal_id.strip()
        if not pid:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} proposal_id is empty")
        if pid in self.proposals:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Proposal already exists")
        if len(self.charters) == 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} No charter published yet")
        if not title.strip():
            raise gl.vm.UserError(f"{ERROR_EXPECTED} title is empty")
        if not body.strip():
            raise gl.vm.UserError(f"{ERROR_EXPECTED} body is empty")
        if len(body) > MAX_TEXT_LEN:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} body too long")
        if len(rationale) > MAX_TEXT_LEN:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} rationale too long")
        try:
            action = json.loads(action_json)
        except Exception:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} action_json is not valid JSON")
        if not isinstance(action, dict):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} action must be a JSON object")
        atype = str(action.get("type", "")).strip().lower()
        if atype not in ("treasury", "record"):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} action.type must be treasury or record")
        if atype == "treasury":
            try:
                amount = int(str(action.get("amount_atto", "0")).strip())
            except Exception:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} treasury amount invalid")
            if amount <= 0:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} treasury amount must be positive")
            recipient = str(action.get("recipient", "")).strip()
            if len(recipient) != 42 or not recipient.startswith("0x"):
                raise gl.vm.UserError(f"{ERROR_EXPECTED} treasury recipient malformed")
            try:
                int(recipient[2:], 16)
            except Exception:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} treasury recipient malformed")
        if int(window_sec) > MAX_WINDOW_SEC:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} window too long")

        self.proposals[pid] = Proposal(
            proposal_id=pid,
            proposer=gl.message.sender_address,
            title=title,
            body=body,
            action_json=action_json,
            rationale=rationale,
            charter_version=len(self.charters) - 1,
            status="pending",
            appeal_count=u256(0),
            executed=False,
            verdict_time=u256(0),
            execute_after=u256(0),
            appeal_note="",
            window_sec=window_sec,
        )
        self.proposal_ids.append(pid)

    @gl.public.write.payable
    def fund_treasury(self) -> dict:
        v = gl.message.value
        if v == u256(0):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} send some value")
        return {"treasury_atto": str(self.balance)}

    @gl.public.write
    def cancel_proposal(self, proposal_id: str) -> dict:
        pid = proposal_id.strip()
        if pid not in self.proposals:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unknown proposal")
        prop = self.proposals[pid]
        sender = gl.message.sender_address
        if prop.proposer != sender and self.owner != sender:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only proposer or charter owner can cancel")
        if prop.status != "pending":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only pending proposals can be cancelled")
        prop.status = "cancelled"
        self.proposals[pid] = prop
        return {"proposal_id": pid, "status": "cancelled"}

    def _review(self, proposal_id: str, appeal_note: str = "") -> dict:
        prop = gl.storage.copy_to_memory(self.proposals[proposal_id])
        version = int(prop.charter_version)
        charter_text = str(self.charters[version])
        try:
            charter_articles = json.loads(charter_text)
            valid_ids = sorted([_norm_id(a.get("id", "")) for a in charter_articles if isinstance(a, dict)])
        except Exception:
            valid_ids = []
        title = str(prop.title)
        body = str(prop.body)
        action_json = str(prop.action_json)
        rationale = str(prop.rationale)
        note = appeal_note.strip()

        def leader_fn():
            appeal_section = ""
            if note:
                appeal_section = f"""
Appeal raised (re-review requested):
{note}

Re-evaluate the ruling in light of this appeal. Uphold or overturn the
previous outcome based on the charter and proposal.
"""
            prompt = f"""You are a charter compliance reviewer for a DAO.
Decide whether the proposal complies with the DAO charter.

Charter articles (authoritative, JSON list of id/title/text):
{charter_text}
{appeal_section}
Proposal title:
{title}

Proposal body:
{body}

Proposed action (JSON):
{action_json}

Proposer rationale:
{rationale}

Rules:
- compliant=true only if NO charter article is violated.
- violated must list the id of EVERY violated article, copied EXACTLY as shown
  in the charter above (for example "A-1"). Empty list if and only if compliant.
- severity is 0-100 overall concern (0 = fully compliant, 100 = severe breach).
- Judge only against the articles above; do not invent rules or article ids.

Respond ONLY in JSON:
{{"compliant": true/false, "violated": [str], "severity": int, "reason": str}}"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(raw, dict):
                parsed = raw
            else:
                parsed = _clean_json(str(raw))
            compliant = _parse_bool(parsed.get("compliant"))
            violated = _parse_violated(parsed.get("violated"))
            severity = _parse_severity(parsed.get("severity"))
            reason = str(parsed.get("reason", ""))
            if not reason.strip():
                raise gl.vm.UserError(f"{ERROR_LLM} Empty reason from LLM")
            if compliant and len(violated) > 0:
                raise gl.vm.UserError(f"{ERROR_LLM} Compliant yet articles listed")
            if not compliant and len(violated) == 0:
                raise gl.vm.UserError(f"{ERROR_LLM} Breach with no article listed")
            for vid in violated:
                if valid_ids and vid not in valid_ids:
                    raise gl.vm.UserError(f"{ERROR_LLM} Unknown article id listed")
            return {
                "compliant": compliant,
                "violated": violated,
                "severity": severity,
                "reason": reason,
            }

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            try:
                v = leader_fn()
            except gl.vm.UserError as e:
                msg = e.message if hasattr(e, "message") else str(e)
                if msg.startswith(ERROR_EXPECTED):
                    return False
                return False
            except Exception:
                return False
            leader = leaders_res.calldata
            try:
                l_compliant = _parse_bool(leader.get("compliant"))
                l_violated = _parse_violated(leader.get("violated"))
                l_severity = _parse_severity(leader.get("severity"))
            except gl.vm.UserError:
                return False
            if l_compliant != bool(v["compliant"]):
                return False
            if sorted(l_violated) != sorted(v["violated"]):
                return False
            if (int(v["severity"]) == 0) != (int(l_severity) == 0):
                return False
            if abs(int(v["severity"]) - int(l_severity)) > 15:
                return False
            return True

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    def _action_amount(self, action_json: str) -> int:
        # Treasury amount promised by an action, else 0. Pure helper.
        try:
            action = json.loads(action_json)
        except Exception:
            return 0
        if not isinstance(action, dict):
            return 0
        if str(action.get("type", "")).strip().lower() != "treasury":
            return 0
        try:
            amount = int(str(action.get("amount_atto", "0")).strip())
        except Exception:
            return 0
        return amount if amount > 0 else 0

    def _store_verdict(
        self,
        pid: str,
        compliant: bool,
        violated: list,
        severity: int,
        reason: str,
    ) -> dict:
        wf = self.proposals[pid]
        # Release any previous reservation first (re-review), then reserve
        # the new one. Action text is immutable, so amounts cannot drift.
        if pid in self.verdicts and bool(self.verdicts[pid].compliant):
            old_amount = self._action_amount(wf.action_json)
            if old_amount > 0 and int(self.reserved) >= old_amount:
                self.reserved = self.reserved - u256(old_amount)
        new_reserved = self._action_amount(wf.action_json) if compliant else 0
        if new_reserved > 0:
            self.reserved = self.reserved + u256(new_reserved)
        self.verdicts[pid] = Verdict(
            compliant=compliant,
            violated_json=json.dumps(violated),
            severity=severity,
            reason=reason,
        )
        now = _now()
        wf.status = "approved" if compliant else "rejected"
        wf.verdict_time = u256(now)
        wf.execute_after = u256(now) + wf.window_sec
        self.proposals[pid] = wf
        return {
            "proposal_id": pid,
            "compliant": compliant,
            "violated": violated,
            "severity": severity,
            "execute_after": now + int(wf.window_sec),
            "reason": reason,
        }

    @gl.public.write
    def review_proposal(self, proposal_id: str) -> dict:
        pid = proposal_id.strip()
        if pid not in self.proposals:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unknown proposal")
        prop = self.proposals[pid]
        if prop.status != "pending":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Proposal already reviewed")
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only charter owner triggers review")
        if pid in self.verdicts:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Proposal already reviewed")

        result = self._review(pid)
        return self._store_verdict(
            pid,
            bool(result["compliant"]),
            list(result["violated"]),
            int(result["severity"]),
            str(result["reason"])[:MAX_REASON_LEN],
        )

    @gl.public.write
    def open_appeal(self, proposal_id: str, note: str) -> dict:
        pid = proposal_id.strip()
        if pid not in self.proposals:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unknown proposal")
        prop = self.proposals[pid]
        sender = gl.message.sender_address
        if prop.proposer != sender and self.owner != sender:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only proposer or charter owner can appeal")
        if prop.status not in ("approved", "rejected"):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} No verdict to appeal yet")
        if bool(prop.executed):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Proposal already executed")
        if u256(_now()) >= prop.execute_after:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Appeal window closed, use execute_proposal")
        if int(prop.appeal_count) >= 1:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only one appeal round allowed")
        if len(note) > MAX_NOTE_LEN:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Appeal note too long")

        prop.status = "disputed"
        prop.appeal_note = note
        prop.appeal_count = prop.appeal_count + 1
        self.proposals[pid] = prop
        return {"proposal_id": pid, "status": "disputed"}

    @gl.public.write
    def resolve_appeal(self, proposal_id: str) -> dict:
        pid = proposal_id.strip()
        if pid not in self.proposals:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unknown proposal")
        prop = self.proposals[pid]
        sender = gl.message.sender_address
        if prop.proposer != sender and self.owner != sender:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only proposer or charter owner can resolve")
        if prop.status != "disputed":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} No open appeal")
        note = str(prop.appeal_note)

        result = self._review(pid, note)
        return self._store_verdict(
            pid,
            bool(result["compliant"]),
            list(result["violated"]),
            int(result["severity"]),
            str(result["reason"])[:MAX_REASON_LEN],
        )

    @gl.public.write
    def execute_proposal(self, proposal_id: str) -> dict:
        pid = proposal_id.strip()
        if pid not in self.proposals:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unknown proposal")
        prop = self.proposals[pid]
        if prop.status not in ("approved",):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} No approved verdict to execute")
        if bool(prop.executed):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Already executed")
        if u256(_now()) < prop.execute_after:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Execution window still open")
        try:
            action = json.loads(prop.action_json)
        except Exception:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Stored action unreadable")
        moved = "0"
        recipient = "none"
        amount = 0
        if str(action.get("type", "")).strip().lower() == "treasury":
            amount = int(str(action.get("amount_atto", "0")).strip())
            if amount <= 0:
                raise gl.vm.UserError(f"{ERROR_EXPECTED} Treasury amount invalid")
            if self.balance < u256(amount):
                raise gl.vm.UserError(f"{ERROR_EXPECTED} Treasury balance insufficient")
            to = Address(str(action.get("recipient", "")).strip())
            _EoaPayout(to).emit_transfer(value=u256(amount))
            moved = str(amount)
            recipient = to.as_hex
        if moved != "0":
            if int(self.reserved) >= amount:
                self.reserved = self.reserved - u256(amount)
        prop.executed = True
        self.proposals[pid] = prop
        return {
            "proposal_id": pid,
            "moved_atto": moved,
            "recipient": recipient,
        }

    @gl.public.write
    def withdraw_treasury(self, amount_atto: u256) -> dict:
        # Owner-only reclaim of UNRESERVED funds: approved-but-unexecuted
        # payouts stay locked by the reserved counter, so withdrawal can
        # never steal a pending execution.
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only charter owner can withdraw")
        amount = int(amount_atto)
        if amount <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Amount must be positive")
        free = int(self.balance) - int(self.reserved)
        if amount > free:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Amount exceeds unreserved balance")
        _EoaPayout(self.owner).emit_transfer(value=u256(amount))
        return {"withdrawn_atto": str(amount), "reserved_atto": str(self.reserved)}

    @gl.public.view
    def get_current_version(self) -> int:
        return int(len(self.charters)) - 1

    @gl.public.view
    def get_charter(self, version: u256) -> str:
        v = int(version)
        if v < 0 or v >= len(self.charters):
            return ""
        return str(self.charters[v])

    @gl.public.view
    def list_proposals(self) -> list:
        return [pid for pid in self.proposal_ids]

    @gl.public.view
    def get_proposal(self, proposal_id: str) -> dict:
        pid = proposal_id.strip()
        if pid not in self.proposals:
            return {}
        prop = self.proposals[pid]
        return {
            "proposal_id": prop.proposal_id,
            "proposer": prop.proposer.as_hex,
            "title": prop.title,
            "body": prop.body,
            "action_json": prop.action_json,
            "rationale": prop.rationale,
            "charter_version": int(prop.charter_version),
            "status": prop.status,
            "appeal_count": int(prop.appeal_count),
            "executed": bool(prop.executed),
            "verdict_time": int(prop.verdict_time),
            "execute_after": int(prop.execute_after),
            "appeal_note": prop.appeal_note,
            "window_sec": int(prop.window_sec),
            "treasury_atto": str(self.balance),
        }

    @gl.public.view
    def get_verdict(self, proposal_id: str) -> dict:
        pid = proposal_id.strip()
        if pid not in self.verdicts:
            return {}
        v = self.verdicts[pid]
        return {
            "compliant": v.compliant,
            "violated": json.loads(v.violated_json),
            "severity": int(v.severity),
            "reason": v.reason,
        }

    @gl.public.view
    def get_equivalence_info(self) -> dict:
        return {
            "method": "custom run_nondet_unsafe validator with independent rerun",
            "decision_fields": ["compliant", "violated", "severity"],
            "compliant_rule": "exact match between leader and validator",
            "violated_rule": "exact match as sets after normalization",
            "severity_tolerance": 15,
            "severity_range": "0-100",
            "rejection_gate": "severity 0 must be unanimous",
            "reason_compared": False,
            "evidence_source": "pinned on-chain charter text plus proposal, same input for leader and validators",
            "timestamps": "deterministic tx time",
            "settlement": "treasury released via finalized EOA transfer after window",
            "dispute": "one proposer-or-owner appeal round with re-review",
        }

    @gl.public.view
    def get_proposal_card(self, proposal_id: str) -> dict:
        pid = proposal_id.strip()
        if pid not in self.proposals:
            return {}
        prop = self.proposals[pid]
        verdict = {}
        if pid in self.verdicts:
            v = self.verdicts[pid]
            verdict = {
                "compliant": v.compliant,
                "violated": json.loads(v.violated_json),
                "severity": int(v.severity),
                "reason": v.reason,
            }
        return {
            "proposal_id": prop.proposal_id,
            "proposer": prop.proposer.as_hex,
            "title": prop.title,
            "body": prop.body,
            "action_json": prop.action_json,
            "rationale": prop.rationale,
            "charter_version": int(prop.charter_version),
            "status": prop.status,
            "appeal_count": int(prop.appeal_count),
            "executed": bool(prop.executed),
            "verdict_time": int(prop.verdict_time),
            "execute_after": int(prop.execute_after),
            "appeal_note": prop.appeal_note,
            "window_sec": int(prop.window_sec),
            "treasury_atto": str(self.balance),
            "verdict": verdict,
            "equivalence": {
                "method": "custom run_nondet_unsafe validator with independent rerun",
                "severity_tolerance": 15,
                "rejection_gate": "severity 0 must be unanimous",
            },
        }
