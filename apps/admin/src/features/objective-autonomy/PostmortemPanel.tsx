"use client";

import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { Sparkles } from "#/icons";
import { useObjectiveAutonomyMutation } from "#/lib/queries/objective-autonomy";

type Props = {
    objectivePublicId?: string;
    existing: Record<string, unknown> | null;
    latestCyclePublicId?: string;
};

const faNumber = (value: unknown) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(Number(value ?? 0));

export function PostmortemPanel({ objectivePublicId, existing, latestCyclePublicId }: Props) {
    const mutation = useObjectiveAutonomyMutation<unknown>();
    const [finalValue, setFinalValue] = useState("0");
    const [confidence, setConfidence] = useState("0.7");
    const [summary, setSummary] = useState("");
    const [lesson, setLesson] = useState("");
    const [evidenceSource, setEvidenceSource] = useState("operator");
    const [evidenceId, setEvidenceId] = useState("manual-review");
    const [evidenceLabel, setEvidenceLabel] = useState("");

    if (!objectivePublicId) return null;

    if (existing) {
        return (
            <Card className="p-5 xl:col-span-2">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="font-semibold">Postmortem و حافظه سازمانی</h2>
                        <p className="text-muted-foreground text-xs">
                            نتیجه نهایی این Objective به Phase 26 Merchant Memory منتقل شده است.
                        </p>
                    </div>
                    <Sparkles className="size-5 text-primary" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border bg-muted/20 p-4">
                        <p className="text-muted-foreground text-xs">Outcome</p>
                        <p className="mt-1 font-semibold">{String(existing.outcome ?? "—")}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                        <p className="text-muted-foreground text-xs">Final value</p>
                        <p className="mt-1 font-semibold">{faNumber(existing.final_value)}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-4">
                        <p className="text-muted-foreground text-xs">Memory reference</p>
                        <p className="mt-1 break-all font-mono text-xs">{String(existing.memory_public_id ?? "—")}</p>
                    </div>
                </div>
            </Card>
        );
    }

    const canSubmit =
        summary.trim().length >= 10 && lesson.trim().length >= 10 && evidenceLabel.trim().length >= 2 && !mutation.isPending;

    return (
        <Card className="relative overflow-hidden p-5 xl:col-span-2">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
            <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <h2 className="font-semibold">Postmortem و انتقال یادگیری به حافظه</h2>
                    <p className="text-muted-foreground text-xs">
                        نتیجه واقعی، شواهد و عدم‌قطعیت را ثبت می‌کند و به Phase 26 متصل می‌شود.
                    </p>
                </div>
                <Sparkles className="size-5 text-primary" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <Label>Final value</Label>
                    <Input type="number" value={finalValue} onChange={(event) => setFinalValue(event.target.value)} />
                </div>
                <div>
                    <Label>Confidence</Label>
                    <Input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={confidence}
                        onChange={(event) => setConfidence(event.target.value)}
                    />
                </div>
                <div className="sm:col-span-2">
                    <Label>خلاصه نتیجه</Label>
                    <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
                </div>
                <div className="sm:col-span-2">
                    <Label>درس آموخته</Label>
                    <Textarea value={lesson} onChange={(event) => setLesson(event.target.value)} />
                </div>
                <div>
                    <Label>Evidence source</Label>
                    <Input value={evidenceSource} onChange={(event) => setEvidenceSource(event.target.value)} />
                </div>
                <div>
                    <Label>Evidence id</Label>
                    <Input value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)} />
                </div>
                <div className="sm:col-span-2">
                    <Label>Evidence label</Label>
                    <Input value={evidenceLabel} onChange={(event) => setEvidenceLabel(event.target.value)} />
                </div>
                <Button
                    className="sm:col-span-2"
                    disabled={!canSubmit}
                    onClick={() =>
                        mutation.mutate({
                            path: `objectives/${objectivePublicId}/postmortem`,
                            body: {
                                final_value: Number(finalValue),
                                summary,
                                lesson,
                                residual_uncertainty: { latest_cycle_public_id: latestCyclePublicId ?? null },
                                confidence: Number(confidence),
                                evidence_refs: [{ source: evidenceSource, id: evidenceId, label: evidenceLabel }],
                            },
                        })
                    }
                >
                    ثبت Postmortem و ذخیره در حافظه Phase 26
                </Button>
            </div>
            {mutation.isError ? <p className="mt-3 text-destructive text-xs">{mutation.error.message}</p> : null}
        </Card>
    );
}
