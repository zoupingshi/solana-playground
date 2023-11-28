import {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import styled, { css } from "styled-components";

import { Id } from "../../constants";
import { PgCommon, RequiredKey, ValueOf } from "../../utils/pg";

export interface PopoverProps {
  /** Popover element to show on trigger */
  popEl?: ReactNode;
  /** Element to anchor to */
  anchorEl?: HTMLElement;
  /** Where to place the popover element relative to the anchor point */
  placement?: "top" | "right" | "bottom" | "left";
  /** Whether to show the pop-up on hover */
  showOnHover?: boolean;
  /**
   * Whether to continue to show the pop-up when the mouse is out of the anchor
   * element but inside the pop-up element.
   */
  continueToShowOnPopupHover?: boolean;
  /** The amount of miliseconds to hover before the pop-up is visible */
  delay?: number;
  /** Max allowed with for the popover text */
  maxWidth?: number | string;
  /** Whether to use secondary background color for the popover */
  bgSecondary?: boolean;
}

const Popover: FC<PopoverProps> = ({ anchorEl, ...props }) => {
  return anchorEl ? (
    <AnchoredPopover {...props} anchorEl={anchorEl} />
  ) : (
    <ChildPopover {...props} />
  );
};

type AnchoredPopoverProps = RequiredKey<PopoverProps, "anchorEl">;

const AnchoredPopover: FC<AnchoredPopoverProps> = ({
  popEl,
  children,
  ...props
}) => <CommonPopover {...props}>{popEl}</CommonPopover>;

type ChildPopoverProps = Omit<PopoverProps, "anchorEl">;

const ChildPopover: FC<ChildPopoverProps> = ({ popEl, children, ...props }) => {
  // Requires re-render on-mount to make sure `anchorRef.current` exists
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <Wrapper ref={anchorRef}>
      {children}
      {mounted && (
        <CommonPopover {...props} anchorEl={anchorRef.current!}>
          {popEl}
        </CommonPopover>
      )}
    </Wrapper>
  );
};

const Wrapper = styled.div`
  width: fit-content;
  height: fit-content;
`;

type CommonPopoverProps = RequiredKey<PopoverProps, "anchorEl">;

const CommonPopover: FC<CommonPopoverProps> = ({
  anchorEl,
  delay = 500,
  placement = "top",
  ...props
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [relativeMidPoint, setRelativeMidPoint] = useState(0);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Always show the popover inside the window
  const reposition = useCallback(() => {
    if (!popoverRef.current) return;

    const anchorRect = anchorEl.getBoundingClientRect();
    let popoverRect = popoverRef.current.getBoundingClientRect();

    switch (placement) {
      case "top":
      case "bottom": {
        // Mid-point of the popover and the anchor element should be the same
        const x = Math.max(
          0,
          anchorRect.x + (anchorRect.width - popoverRect.width) / 2
        );
        const y = Math.max(
          0,
          placement === "top"
            ? anchorRect.top - (popoverRect.height + ARROW_RADIUS)
            : anchorRect.bottom + ARROW_RADIUS
        );
        setPosition({
          x:
            Math.round(x + popoverRect.width) > window.innerWidth
              ? Math.round(window.innerWidth - popoverRect.width)
              : x,
          y,
        });

        // Get the rect again because `setPosition` above could affect the result
        popoverRect = popoverRef.current.getBoundingClientRect();
        if (popoverRect.left === 0) {
          const distanceToLeftEdge = anchorRect.left;
          const totalDistance = distanceToLeftEdge + anchorRect.width / 2;
          setRelativeMidPoint(totalDistance);
        } else if (Math.round(popoverRect.right) === window.innerWidth) {
          const distanceToRightEdge = window.innerWidth - anchorRect.right;
          const totalDistance = distanceToRightEdge + anchorRect.width / 2;
          setRelativeMidPoint(popoverRect.width - totalDistance);
        } else {
          setRelativeMidPoint(popoverRect.width / 2);
        }
        break;
      }
      case "right":
      case "left": {
        // Mid-point of the popover and the anchor element should be the same
        const x = Math.max(
          0,
          placement === "left"
            ? anchorRect.left - (popoverRect.width + ARROW_RADIUS)
            : anchorRect.right + ARROW_RADIUS
        );
        const y = Math.max(
          0,
          anchorRect.y + (anchorRect.height - popoverRect.height) / 2
        );
        setPosition({
          x,
          y:
            Math.round(y + popoverRect.height) > window.innerHeight
              ? Math.round(window.innerHeight - popoverRect.height)
              : y,
        });

        // Get the rect again because `setPosition` above could affect the result
        popoverRect = popoverRef.current.getBoundingClientRect();
        if (popoverRect.top === 0) {
          const distanceToTopEdge = anchorRect.top;
          const totalDistance = distanceToTopEdge + anchorRect.height / 2;
          setRelativeMidPoint(totalDistance);
        } else if (Math.round(popoverRect.bottom) === window.innerHeight) {
          const distanceToBottomEdge = popoverRect.height;
          const totalDistance = distanceToBottomEdge - anchorRect.height / 2;
          setRelativeMidPoint(totalDistance);
        } else {
          setRelativeMidPoint(popoverRect.height / 2);
        }
      }
    }
  }, [anchorEl, placement]);

  // Reposition on `maxWidth` or `isVisible` change
  useLayoutEffect(() => {
    if (isVisible) reposition();
  }, [props.maxWidth, isVisible, reposition]);

  // Set popover and arrow position on resize
  useEffect(() => {
    if (!isVisible) return;

    const popoverEl = popoverRef.current;
    if (!popoverEl) return;

    const repositionResizeObserver = new ResizeObserver(reposition);
    repositionResizeObserver.observe(anchorEl);
    repositionResizeObserver.observe(popoverEl);

    return () => {
      repositionResizeObserver.unobserve(anchorEl);
      repositionResizeObserver.unobserve(popoverEl);
    };
  }, [anchorEl, isVisible, reposition]);

  // Handle open
  useEffect(() => {
    if (props.showOnHover) {
      anchorEl.onmouseenter = (ev: MouseEvent) => {
        const el = ev.target as Element;
        if (el.contains(popoverRef.current)) return;

        const pos: Position = { x: ev.clientX, y: ev.clientY };
        const updateMousePosition = PgCommon.throttle((ev: MouseEvent) => {
          pos.x = ev.x;
          pos.y = ev.y;
        });
        document.addEventListener("mousemove", updateMousePosition);

        setTimeout(() => {
          if (anchorEl) {
            // Get the rect inside the callback because element size can change
            const anchorRect = getRoundedClientRect(anchorEl);
            if (
              pos.x > anchorRect.left &&
              pos.x < anchorRect.right &&
              pos.y < anchorRect.bottom &&
              pos.y > anchorRect.top
            ) {
              setIsVisible(true);
            }
          }

          document.removeEventListener("mousemove", updateMousePosition);
        }, delay);
      };
    } else {
      anchorEl.onmousedown = () => {
        setIsVisible(true);
      };
    }
  }, [props.showOnHover, delay, anchorEl]);

  // Handle hide
  useEffect(() => {
    if (!isVisible) return;

    if (props.showOnHover) {
      const hide = PgCommon.throttle((ev: MouseEvent) => {
        if (!popoverRef.current) return;

        // Get the rect inside the callback because element size can change
        const anchorRect = getRoundedClientRect(anchorEl);
        const isInsideAnchorHorizontal =
          ev.x > anchorRect.left && ev.x < anchorRect.right;
        const isInsideAnchorVertical =
          ev.y > anchorRect.top && ev.y < anchorRect.bottom;
        const isInsideAnchor =
          isInsideAnchorHorizontal && isInsideAnchorVertical;
        if (isInsideAnchor) return;

        if (props.continueToShowOnPopupHover) {
          const popoverRect = getRoundedClientRect(popoverRef.current);
          let isAnchorAligned;
          let isInsidePopover;

          switch (placement) {
            case "top":
              isAnchorAligned =
                ev.y < anchorRect.bottom ||
                (isInsideAnchorVertical && !isInsideAnchorHorizontal);
              isInsidePopover =
                ev.x > popoverRect.left &&
                ev.x < popoverRect.right &&
                ev.y > popoverRect.top &&
                ev.y < popoverRect.bottom + ARROW_RADIUS;
              break;

            case "bottom":
              isAnchorAligned =
                ev.y > anchorRect.top ||
                (isInsideAnchorVertical && !isInsideAnchorHorizontal);
              isInsidePopover =
                ev.x > popoverRect.left &&
                ev.x < popoverRect.right &&
                ev.y > popoverRect.top - ARROW_RADIUS &&
                ev.y < popoverRect.bottom;
              break;

            case "left":
              isAnchorAligned =
                ev.x < anchorRect.left ||
                (isInsideAnchorVertical && !isInsideAnchorHorizontal);
              isInsidePopover =
                ev.x > popoverRect.left &&
                ev.x < popoverRect.right + ARROW_RADIUS &&
                ev.y > popoverRect.top &&
                ev.y < popoverRect.bottom;
              break;

            case "right":
              isAnchorAligned =
                ev.x > anchorRect.right ||
                (isInsideAnchorVertical && !isInsideAnchorHorizontal);
              isInsidePopover =
                ev.x > popoverRect.left - ARROW_RADIUS &&
                ev.x < popoverRect.right &&
                ev.y > popoverRect.top &&
                ev.y < popoverRect.bottom;
          }

          if (!(isAnchorAligned && isInsidePopover)) setIsVisible(false);
        } else {
          // Close outside of `anchorRect`
          if (!isInsideAnchor) setIsVisible(false);
        }
      });

      document.addEventListener("mousemove", hide);
      return () => document.removeEventListener("mousemove", hide);
    } else {
      // Ignore the initial open click because the initial open click also
      // triggers the `hide` callback run
      let isInitial = true;
      const hide = (ev: MouseEvent) => {
        if (isInitial) {
          isInitial = false;
          return;
        }

        const isOutside = !popoverRef.current?.contains(ev.target as Node);
        if (isOutside) setIsVisible(false);
      };

      document.addEventListener("mousedown", hide);
      return () => document.removeEventListener("mousedown", hide);
    }
  }, [
    isVisible,
    placement,
    props.showOnHover,
    props.continueToShowOnPopupHover,
    anchorEl,
  ]);

  if (!isVisible) return null;

  return ReactDOM.createPortal(
    <StyledPopover
      ref={popoverRef}
      relativeMidPoint={relativeMidPoint}
      placement={placement}
      {...position}
      {...props}
    />,
    document.getElementById(Id.PORTAL)!
  );
};

/** Popover radius in px */
const ARROW_RADIUS = 8;

interface Position {
  x: number;
  y: number;
}

const StyledPopover = styled.div<
  Required<Pick<PopoverProps, "placement">> &
    Pick<PopoverProps, "maxWidth" | "bgSecondary"> &
    Position & { relativeMidPoint: number }
>`
  ${({
    placement,
    x,
    y,
    relativeMidPoint,
    maxWidth,
    bgSecondary,
    theme,
  }) => css`
    position: absolute;
    left: ${x}px;
    top: ${y}px;

    max-width: ${
      !maxWidth
        ? "fit-content"
        : typeof maxWidth === "number"
        ? `${maxWidth}px`
        : maxWidth
    };
    width: fit-content;
    height: fit-content;

    &::after {
      position: absolute;
      ${placement}: 100%;
      ${placement === "top" || placement === "bottom" ? "left" : "top"}: ${
    relativeMidPoint - ARROW_RADIUS
  }px;

      content: "";
      border: ${ARROW_RADIUS}px solid transparent;
      border-${placement}-color: ${
    bgSecondary
      ? theme.components.tooltip.bgSecondary
      : theme.components.tooltip.bg
  };
      pointer-events: none;
    }
  `}
`;

/**
 * Get the `DOMRect` of the given element with extra padding.
 *
 * @param el element to get the rect of
 * @returns the rounded `DOMRect`
 */
const getRoundedClientRect = (el: HTMLElement) => {
  type RoundedRect = Omit<DOMRect, "toJSON">;
  const addPadding = (key: keyof RoundedRect, value: ValueOf<RoundedRect>) => {
    const PADDING = 1;
    switch (key) {
      case "top":
        return value - PADDING;
      case "right":
        return value + PADDING;
      case "bottom":
        return value + PADDING;
      case "left":
        return value - PADDING;
      default:
        return value;
    }
  };

  return PgCommon.entries(
    el.getBoundingClientRect().toJSON() as RoundedRect
  ).reduce((acc, [key, value]) => {
    acc[key] = Math.round(addPadding(key, value));
    return acc;
  }, {} as { -readonly [K in keyof RoundedRect]: RoundedRect[K] });
};

export default Popover;