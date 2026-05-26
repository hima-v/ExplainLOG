from __future__ import annotations

from . import step1_load, step2_featurize, step3_detect, step4_reduce, step5_cluster, step6_summarize


def run() -> None:
    # keeping orchestration dead simple —
    # debuggability > cleverness for pipelines
    step1_load.run()
    step2_featurize.run()
    step3_detect.run()
    step4_reduce.run()
    step5_cluster.run()
    step6_summarize.run()


if __name__ == "__main__":
    run()

