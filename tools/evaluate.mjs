import path from "node:path";
import process from "node:process";

import {
  EvaluationSuiteError,
  gradeEvaluationRun,
  listEvaluationTasks,
  prepareEvaluationRun,
  validateEvaluationRecord,
} from "./lib/evaluation-suite.mjs";
import { projectRoot } from "./lib/project.mjs";

const arguments_ = process.argv.slice(2);

function usage() {
  process.stderr.write(
    "usage: node tools/evaluate.mjs " +
      "<list|prepare TASK RUN|grade TASK RUN|validate-record TASK RUN>\n",
  );
  process.exitCode = 1;
}

function relativePath(absolutePath) {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

try {
  const command = arguments_.at(0);
  if (command === "list" && arguments_.length === 1) {
    for (const task of listEvaluationTasks(projectRoot)) {
      process.stdout.write(task.id + "\n");
    }
  } else if (command === "prepare" && arguments_.length === 3) {
    const prepared = prepareEvaluationRun(
      projectRoot,
      arguments_.at(1),
      arguments_.at(2),
    );
    process.stdout.write(
      JSON.stringify({
        record: relativePath(prepared.record),
        task: prepared.task,
        workspace: relativePath(prepared.workspace),
      }) + "\n",
    );
  } else if (command === "grade" && arguments_.length === 3) {
    process.stdout.write(
      JSON.stringify(
        gradeEvaluationRun(projectRoot, arguments_.at(1), arguments_.at(2)),
      ) + "\n",
    );
  } else if (command === "validate-record" && arguments_.length === 3) {
    process.stdout.write(
      JSON.stringify(
        validateEvaluationRecord(
          projectRoot,
          arguments_.at(1),
          arguments_.at(2),
        ),
      ) + "\n",
    );
  } else {
    usage();
  }
} catch (error) {
  if (error instanceof EvaluationSuiteError) {
    process.stderr.write("Evaluation failed: " + error.code + ".\n");
    process.exitCode = 1;
  } else {
    throw error;
  }
}
