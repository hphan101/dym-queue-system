def restore_table_row_borders(source, target, bounds):
    """Restore full-width Word borders after clearing fillable placeholders."""
    left, top, right, bottom = bounds
    rows = {}
    for line in source.lines:
        y = line['top']
        if (abs(y - line['bottom']) < .01 and top - 2 <= y <= bottom + 2
                and left - 1 <= line['x0'] < line['x1'] <= right + 1):
            rows.setdefault(round(y, 2), []).append(line)

    for y, segments in rows.items():
        # Partial rules within merged cells should keep their original span.
        if sum(line['width'] for line in segments) < (right - left) * .95:
            continue
        start = (min(line['x0'] for line in segments), y)
        end = (max(line['x1'] for line in segments), y)
        target.draw_line(start, end, color=(1, 1, 1), width=.75)
        target.draw_line(start, end, color=(.5, .5, .5), width=.35)
