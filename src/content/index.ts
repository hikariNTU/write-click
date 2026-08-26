import { COMMANDS } from "../shared/commands";
import { loadSettings } from "../shared/settings";
import { createOverlay } from "./overlay";
import { quantize } from "./recognizer";
import type { Point } from "./recognizer";
import { Trail } from "./trail";
import { attachTrigger } from "./trigger-runtime";

async function main(): Promise<void> {
  // Sub-frames get their own bridge in a later phase; for now the top frame
  // owns the overlay and the recognizer.
  if (window.top !== window) return;

  const { sync, local } = await loadSettings();
  if (!local.enabled || sync.disabledOrigins.includes(location.origin)) return;

  const trail = new Trail(createOverlay(), sync.trail);
  let points: Point[] = [];

  const describe = (stroke: string): string => {
    if (!stroke) return "";
    const command = sync.gestures[stroke];
    return command ? `${stroke} · ${COMMANDS[command].label}` : `${stroke} · unassigned`;
  };

  attachTrigger(local.trigger, {
    onStart(point) {
      points = [point];
      trail.render(points);
    },
    onMove(point) {
      points.push(point);
      trail.render(points);
      trail.setLabel(describe(quantize(points)));
    },
    onEnd(drifted) {
      const stroke = drifted ? quantize(points) : "";
      const command = stroke ? sync.gestures[stroke] : undefined;
      // Phase 3 runs these. For now, prove recognition end to end.
      console.info("[write-click] gesture", { stroke, command, samples: points.length });
      points = [];
      trail.clear();
    },
    onCancel() {
      points = [];
      trail.clear();
    },
  });

  console.info("[write-click] armed", local.trigger);
}

void main();
