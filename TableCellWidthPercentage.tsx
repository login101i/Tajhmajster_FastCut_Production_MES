'use client';

import React from 'react';
import clsx from 'clsx';
import {
  PRODUCTION_PERCENT_FILL_COLOR,
  formatProductionPercentValue,
  parseProductionPercent,
  resolveProductionPercentFillColor,
} from '@/utils/Functions/Production/utils/formatPercent';

export { PRODUCTION_PERCENT_FILL_COLOR, resolveProductionPercentFillColor };

export interface TableCellWidthPercentageProps {
  percent: number | string | null | undefined;
  className?: string;
  fillColor?: string;
  /** When set, shown instead of the formatted percent value. */
  valueLabel?: string;
  /** Tailwind classes for the percent label (font size, weight, color). */
  labelClassName?: string;
  /** When true, appends "%" to the label (default: true). */
  showPercentSign?: boolean;
  /** Horizontal alignment of the percent label (default: 'left'). `fill-end` = right edge of the fill bar. */
  labelAlign?: 'left' | 'center' | 'right' | 'fill-end';
  /** Fill bar grows from left (default) or from the right edge inward. */
  fillFrom?: 'left' | 'right';
  emptyLabel?: string;
}

export const TableCellWidthPercentage: React.FC<TableCellWidthPercentageProps> = ({
  percent,
  className,
  fillColor,
  valueLabel,
  labelClassName,
  showPercentSign = true,
  labelAlign = 'left',
  fillFrom = 'left',
  emptyLabel = '—',
}) => {
  const parsed = parseProductionPercent(percent);

  if (parsed == null) {
    return <span className={clsx('text-gray-400', className)}>{emptyLabel}</span>;
  }

  const label =
    valueLabel ??
    `${formatProductionPercentValue(parsed)}${showPercentSign ? '%' : ''}`;
  const resolvedFillColor = fillColor ?? resolveProductionPercentFillColor(parsed);
  const fillAnchorClass = fillFrom === 'right' ? 'right-0' : 'left-0';
  const fillWidthStyle = { width: `${parsed}%`, backgroundColor: resolvedFillColor };
  const isRightFillEndBar = fillFrom === 'right' && labelAlign === 'fill-end';

  return (
    <div
      className={clsx(
        'relative h-full overflow-hidden',
        isRightFillEndBar ? 'w-[4.5rem] max-w-[152px] shrink-0' : 'min-h-[1.35rem] w-full',
        className,
      )}
      title={label}
    >
      <div
        className={clsx('absolute inset-y-0', fillAnchorClass)}
        style={fillWidthStyle}
        aria-hidden
      />
      {labelAlign === 'fill-end' ? (
        fillFrom === 'right' ? (
          <span
            className={clsx(
              'absolute inset-y-0 right-0 z-10 flex w-full max-w-[152px] items-center justify-end pr-0.5 text-[12px] font-medium leading-tight text-gray-900',
              labelClassName,
            )}
          >
            {label}
          </span>
        ) : (
          <span
            className={clsx(
              'absolute inset-y-0 left-0 z-10 flex items-center justify-end pr-0.5 text-[12px] font-medium leading-tight text-gray-900',
              labelClassName,
            )}
            style={{ width: `${parsed}%` }}
          >
            {label}
          </span>
        )
      ) : (
        <span
          className={clsx(
            'relative z-10 block w-full py-1 text-[12px] font-medium leading-tight text-gray-900',
            labelAlign === 'right' && 'pr-1.5 pl-1 text-right',
            labelAlign === 'center' && 'px-2 text-center',
            labelAlign === 'left' && 'px-2 text-left',
            labelClassName,
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default TableCellWidthPercentage;
