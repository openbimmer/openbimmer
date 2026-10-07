# Roadmap: read-only BMW control unit scan

Goal: list every control unit of an F/G-series BMW with its identification and fault memory, like the module list in BimmerCode or BimmerLink, without writing anything to the car.

Status: researched, not implemented. Needs a test session in a real car with a vLinker or OBDLink adapter before it ships.

## Out of scope

- Coding (changing module settings). It needs BMW's per-module coding data (CAFD), which is proprietary and version specific. Guessed coding values can damage modules.
- Clearing module fault memory (`14 FF FF FF`), service resets, battery registration and anything else that writes.

## Bus and addressing (F/G series, D-CAN on the OBD port)

- 500 kbit/s, 11-bit IDs, ISO-TP with BMW extended addressing.
- Requests: CAN ID `0x6F1`, first data byte is the target address, then the ISO-TP PCI and UDS payload.
- Responses: CAN ID `0x600 + ECU address`, first data byte `0xF1` (tester), then PCI and payload.
- Flow control for multi-frame answers is sent by the tester on `0x6F1` with the ECU address as first byte (`<addr> 30 <block size> <st min>`).

## Adapter approach

EdiabasLib (Deep OBD) is the reference open-source implementation. For standard ELM327 chips it does not use the chip's ISO-TP automation:

- Custom protocol B: `ATPBC001` (11 bit, 500 kbit/s, data format none) and `ATSPB`, plus `ATSH6F1`, `ATCF600`, `ATCM700`, `ATAL`, `ATH1`, `ATS0`.
- ISO-TP single, first, consecutive and flow control frames are built by the app, with the target address as the first of the 8 data bytes.
- Responses are read with `ATMA` (monitor all) and filtered by CAN ID.

Source: `EdiabasLib/EdiabasLib/EdElmInterface.cs` in github.com/uholeschak/ediabaslib (init table and the CAN send/receive functions). Our implementation must be written from these protocol facts, not copied, because EdiabasLib is GPL.

Adapter caveats: genuine PIC18F25K80-based ELM327 (1.4b, 1.5, 2.1) and STN-based OBDLink work; many cheap clones fail on short CAN frames (`CAN ERROR`). The scan should detect this and explain it instead of failing silently.

## Addresses (verified for F/G series)

| Address | Module |
| --- | --- |
| 0x01 | Airbag (ACSM) |
| 0x10 | Gateway (ZGW) |
| 0x12 | Engine (DME/DDE) |
| 0x18 | Transmission (EGS) |
| 0x29 | Stability control (DSC) |
| 0x40 | Body domain controller (BDC), FEM on earlier F-series |
| 0x60 | Instrument cluster (KOMBI) |
| 0x63 | Head unit |

More addresses: generic table in the f01 SGBD documentation (github.com/emdzej/ediabasx-docs-sgbd, `docs/sgbd/f01.md`). Unknown addresses that do not answer within the timeout are skipped.

## Requests (all read-only, default session, no session change)

| Request | Meaning |
| --- | --- |
| `22 F190` | VIN |
| `22 F150` | Identification (SGBD index) |
| `22 F101` | SVK, software versions |
| `22 F18C` | Serial number |
| `22 F18B` | Manufacturing date |
| `19 02 0C` | Fault memory, status mask pending + confirmed |

## Test plan

1. Demo transport: simulate a gateway with 8 modules, including a multi-frame SVK answer and an unanswered address.
2. Unit tests for the ISO-TP framer (single, first, consecutive, flow control, sequence wrap, missing frame).
3. Car test: F-series and G-series car, vLinker and OBDLink CX; record the adapter console for each.
