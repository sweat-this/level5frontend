"use client";

import { Theme } from "@mui/material/styles";
import {
  DataGrid,
  DataGridProps,
  GridCallbackDetails,
  GridColDef,
  GridColumnVisibilityModel,
  GridPaginationModel,
  GridValidRowModel,
  useGridApiRef,
} from "@mui/x-data-grid";
import { useEffect } from "react";
import type { Summary } from "../lib/backend-v1-public/types";

// Styled against plain MUI palette tokens (grey/divider/background.paper) that always exist,
// rather than a custom theme namespace - this project has no ThemeProvider wiring a custom
// palette, so string keys like 'DataTable.headerColor' would silently resolve to nothing.
const style: DataGridProps["sx"] = (theme: Theme) => ({
  width: "100%",
  padding: 1,
  ".MuiDataGrid-columnHeader, .MuiDataGrid-scrollbarFiller--header": {
    backgroundColor: theme.palette.grey[100],
  },
  ".MuiDataGrid-row": {
    backgroundColor: theme.palette.background.paper,
  },
  "--DataGrid-rowBorderColor": "none",
  borderColor: theme.palette.divider,
  ".MuiDataGrid-scrollbar--horizontal": {
    display: "block",
  },
  ".MuiDataGrid-scrollbar::-webkit-scrollbar": {
    width: "1em",
  },
  ".MuiDataGrid-scrollbar::-webkit-scrollbar-thumb": {
    backgroundColor: theme.palette.grey[300],
    borderRadius: "10px",
  },
  ".MuiDataGrid-scrollbar::-webkit-scrollbar-thumb:hover": {
    backgroundColor: theme.palette.grey[400],
  },
});

export default function DataTable({
  columns,
  data,
  onPaginationChange,
  setLoading,
  loading,
  disableColumnFilter = false,
  disableColumnSorting = false,
  columnVisibilityModel,
}: Readonly<{
  columns: GridColDef[];
  data: Summary;
  onPaginationChange: (
    model: GridPaginationModel,
    details: GridCallbackDetails,
  ) => void;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;
  // The backend behind this data may or may not support server-side filtering/sorting - callers
  // that know it doesn't should disable the corresponding UI rather than present a control that
  // silently does nothing.
  disableColumnFilter?: boolean;
  disableColumnSorting?: boolean;
  // Controlled, not initialState: callers that need it to respond to a breakpoint change (see
  // ScoresTable.tsx) need DataGrid to pick up the updated model on every render, not just once.
  columnVisibilityModel?: GridColumnVisibilityModel;
}>) {
  const { content } = data;
  const asyncContent = content as GridValidRowModel[];
  const apiRef = useGridApiRef();

  // Not mirroring `content` into state - `asyncContent` above is derived directly from it during
  // render. This effect exists only to flip the *parent's* `loading` state off exactly when a new
  // page of data arrives (see ScoresTable.tsx), which is a different component's state and so
  // can't be set during this component's own render.
  useEffect(() => {
    setLoading(false);
  }, [content, setLoading]);

  return (
    <DataGrid
      rows={asyncContent}
      columns={columns}
      rowCount={data.totalElements}
      initialState={{
        pagination: {
          paginationModel: {
            page: data.number,
            pageSize: data.size,
          },
        },
      }}
      pageSizeOptions={[15, 30, 60, 100]}
      disableRowSelectionOnClick
      disableColumnFilter={disableColumnFilter}
      disableColumnSorting={disableColumnSorting}
      paginationMode="server"
      onPaginationModelChange={(model, details) => {
        if (loading) return;
        setLoading(true);
        onPaginationChange(model, details);
      }}
      sx={style}
      apiRef={apiRef}
      loading={loading}
      columnVisibilityModel={columnVisibilityModel}
    />
  );
}
