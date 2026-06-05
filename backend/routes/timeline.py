"""GET /api/timeline — anomaly counts per hour bin.

Real timestamps in HDFS_v1 are messy (TimeInterval is a stringified float array),
so we bin by row position into 38 synthetic hourly bins. Good enough for the
trend shape the timeline view actually needs."""
from datetime import datetime, timedelta

from fastapi import APIRouter

import config
from data.loader import get_db
from schemas import TimelineBin

router = APIRouter()

# anchor the synthetic clock to the real dataset window start
_START = datetime(2008, 11, 9, 0, 0, 0)


@router.get("/api/timeline", response_model=list[TimelineBin])
async def get_timeline():
    con = get_db()
    n_bins = config.TIMELINE_BINS
    # ntile splits ordered rows into N roughly equal buckets — our stand-in for hours
    rows = con.execute(
        """
        WITH binned AS (
            SELECT is_anomaly,
                   ntile(?) OVER (ORDER BY block_id) - 1 AS bin
            FROM sessions
        )
        SELECT bin,
               count(*)                       AS total_count,
               sum(CASE WHEN is_anomaly THEN 1 ELSE 0 END) AS anomaly_count
        FROM binned
        GROUP BY bin
        ORDER BY bin
        """,
        [n_bins],
    ).fetchall()

    out = []
    for bin_idx, total, anom in rows:
        ts = _START + timedelta(hours=int(bin_idx))
        out.append(
            TimelineBin(
                hour=int(bin_idx),
                timestamp=ts.isoformat(),
                anomaly_count=int(anom or 0),
                total_count=int(total),
            )
        )
    return out
