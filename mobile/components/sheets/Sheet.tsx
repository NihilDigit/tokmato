/**
 * Sheet — RN port of `components/ui/responsive-sheet.tsx`.
 *
 * Web auto-branches to a Radix Dialog on desktop and a Radix Sheet on
 * mobile. RN is mobile-first: always a bottom sheet via
 * `@gorhom/bottom-sheet`. Tablet / desktop responsive can be added
 * later by routing wide layouts through a dialog.
 *
 * Conventions:
 *   - `open` is the controlled prop; `onClose` is called when the
 *     user dismisses (drag-to-close, backdrop, hardware back).
 *   - Snap points default to ["50%", "90%"]. Sheets that need a tall
 *     editor (NotesSheet) opt into ["90%"].
 *   - `enableDynamicSizing` is on by default so sheets size to content
 *     when their height fits within the largest snap.
 */

import { useEffect, useRef, type ReactNode } from "react";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useTheme } from "../../lib/use-theme";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  snapPoints?: string[];
  enableDynamicSizing?: boolean;
}

export function Sheet({
  open,
  onClose,
  children,
  snapPoints,
  enableDynamicSizing = true,
}: SheetProps) {
  const ref = useRef<BottomSheetModal>(null);
  const theme = useTheme();

  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onClose}
      snapPoints={snapPoints ?? ["50%", "90%"]}
      enableDynamicSizing={enableDynamicSizing}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: theme.color.paper,
        borderTopLeftRadius: theme.layout.borderRadiusLarge,
        borderTopRightRadius: theme.layout.borderRadiusLarge,
      }}
      handleIndicatorStyle={{ backgroundColor: theme.color.rule }}
    >
      <BottomSheetView style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function renderBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.4}
    />
  );
}
