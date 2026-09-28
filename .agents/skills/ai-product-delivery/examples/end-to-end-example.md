# End-to-End Example

## Scenario

A product team wants users to reset a forgotten password.

---

# 1. Product Discovery

## Problem Statement

Users who forget their password cannot regain access without support intervention.

## Target Users

Registered users with an existing account.

## Desired Outcome

A user can securely initiate and complete a password reset flow.

## Business Value

Reduces support dependency and improves account recovery.

## In Scope

- Request password reset
- Receive a recovery mechanism
- Set a new password

## Out of Scope

- Changing a password while already authenticated
- Account deletion

## Pending Definitions

- Recovery mechanism details
- Password policy

## Success Criteria

- Eligible users can recover account access.
- Unauthorized users cannot reset another user's password.

---

# 2. HF User Story

## Title

Reset Forgotten Password

## Business Value

Allow users to recover account access without requiring manual support.

## User Story

As a registered user, I want to reset my forgotten password so that I can regain access to my account.

## Description

The user must be able to initiate account recovery and complete the process using an approved recovery mechanism.

## Acceptance Criteria

### AC-01 — Start Password Recovery

Given I have a registered account  
When I request password recovery  
Then the system initiates the approved recovery flow.

### AC-02 — Complete Password Reset

Given I have successfully completed the required recovery verification  
When I provide a valid new password  
Then my password is updated and I can use it according to the approved authentication flow.

## Out of Scope

- Password changes for authenticated users

## Pending Definitions

- Password policy
- Recovery token expiration
- Delivery channel

---

# 3. AF Refinement

## Domain Glossary

- Password Recovery: process used to regain account access.
- Recovery Verification: approved mechanism proving control of the account.

## Backend Contracts

`PENDING_DEFINITION`

No verified endpoint contract was supplied.

## Proposed Tests

- Verify an eligible account can initiate recovery.
- Verify recovery cannot complete without successful verification.
- Verify acceptance criteria AC-01 and AC-02.

---

# 4. Technical Specification

## Overview

Implement password recovery while preserving existing authentication behavior.

## Source Requirements

- HF User Story: Reset Forgotten Password
- AC-01
- AC-02

## Functional Requirements

- Support initiating recovery.
- Support completing recovery after required verification.

## Pending Decisions

- Recovery transport
- Token lifecycle
- Password policy

## Risks

- Account enumeration risk
- Recovery mechanism abuse

## Testing Strategy

### Unit

Validate password policy once defined.

### Integration

Validate recovery lifecycle once contracts are defined.

---

# 5. Sprint Plan

## Sprint Goal

Deliver a validated password recovery workflow once the pending security and contract decisions are approved.

## Included Work

### Password Recovery

**Dependencies:**

- Recovery mechanism definition
- Password policy definition

**Tasks:**

1. Finalize pending product decisions.
2. Validate technical contract.
3. Implement approved recovery workflow.
4. Add tests derived from AC-01 and AC-02.

## Planning Status

PARTIALLY_READY

## Blockers

- Critical recovery details require definition before implementation planning can be finalized.
