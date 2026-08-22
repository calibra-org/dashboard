import { test } from "@japa/runner";

import {
    boundedAttempts,
    isForbiddenHandlerKey,
    requiresHumanApproval,
} from "../../../app/services/agent_orchestrator/contracts.js";

test.group("Phase22 agent orchestration contracts", () => {
    test("forbids arbitrary execution handlers", ({ assert }) => {
        assert.isTrue(isForbiddenHandlerKey("shell.exec"));
        assert.isTrue(isForbiddenHandlerKey("sql.raw"));
        assert.isFalse(isForbiddenHandlerKey("commerce.order.hold"));
    });
    test("high risk requires human approval", ({ assert }) => {
        assert.isTrue(requiresHumanApproval("high"));
        assert.isTrue(requiresHumanApproval("critical"));
        assert.isFalse(requiresHumanApproval("read_only"));
    });
    test("retry attempts are bounded", ({ assert }) => {
        assert.equal(boundedAttempts(99, 3), 3);
        assert.equal(boundedAttempts(0, 3), 1);
    });
});
