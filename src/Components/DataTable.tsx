import { SxProps, Theme } from '@mui/material';
import {
  DataGrid,
  GridCallbackDetails,
  GridColDef,
  GridPaginationModel,
  GridValidRowModel,
  useGridApiRef
} from '@mui/x-data-grid';
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

// Styled against plain MUI palette tokens (grey/divider/background.paper) that always exist,
// rather than a custom theme namespace - this project has no ThemeProvider wiring a custom
// palette, so string keys like 'DataTable.headerColor' would silently resolve to nothing.
const style: SxProps<Theme> = (theme) => ({
  width: '100%',
  padding: 1,
  '.MuiDataGrid-columnHeader, .MuiDataGrid-scrollbarFiller--header': {
    backgroundColor: theme.palette.grey[100]
  },
  '.MuiDataGrid-row': {
    backgroundColor: theme.palette.background.paper
  },
  '--DataGrid-rowBorderColor': 'none',
  borderColor: theme.palette.divider,
  '.MuiDataGrid-scrollbar--horizontal': {
    display: 'block'
  },
  '.MuiDataGrid-scrollbar::-webkit-scrollbar': {
    width: '1em'
  },
  '.MuiDataGrid-scrollbar::-webkit-scrollbar-thumb': {
    backgroundColor: theme.palette.grey[300],
    borderRadius: '10px'
  },
  '.MuiDataGrid-scrollbar::-webkit-scrollbar-thumb:hover': {
    backgroundColor: theme.palette.grey[400]
  }
});

export default function DataTable({
  columns,
  data,
  onPaginationChange,
  setLoading,
  loading,
  disableColumnFilter = false,
  disableColumnSorting = false
}: {
  columns: GridColDef[];
  data: Summary;
  onPaginationChange: (model: GridPaginationModel, details: GridCallbackDetails) => void;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;
  // The backend behind this data may or may not support server-side filtering/sorting - callers
  // that know it doesn't should disable the corresponding UI rather than present a control that
  // silently does nothing.
  disableColumnFilter?: boolean;
  disableColumnSorting?: boolean;
}) {
  const { content } = data;
  const [asyncContent, setAsyncContent] = useState<GridValidRowModel[]>([]);
  const location = useLocation();
  const params = useParams();
  const apiRef = useGridApiRef();

  // simulate async data. Bug fix for page render block
  useEffect(() => {
    setAsyncContent(content as GridValidRowModel[]);
    setLoading(false);
  }, [content, setLoading]);

  // reset page
  useEffect(() => {
    // when going to home page
    if (location.pathname === '/') {
      apiRef.current.setPage(0);
    }

    // when filter changes, but page doesn't
    if (params.filter && !params.page) {
      apiRef.current.setPage(0);
    }
  }, [apiRef, location, params.filter, params.page]);

  return (
    <DataGrid
      rows={asyncContent}
      columns={columns}
      rowCount={data.totalElements}
      initialState={{
        pagination: {
          paginationModel: {
            page: data.number,
            pageSize: data.size
          }
        }
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
    />
  );
}
