// Heavy import surface to produce a large real module graph (thousands of modules).
import * as _ from 'lodash-es'
import * as dateFns from 'date-fns'
import { interval } from 'rxjs'
import { map, filter, take } from 'rxjs/operators'

import {
  Button, TextField, Card, CardContent, CardActions, Typography, AppBar, Toolbar,
  Drawer, List, ListItem, ListItemText, ListItemIcon, Divider, Grid, Box, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog,
  DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Tabs, Tab, Chip,
  Avatar, Badge, Tooltip, Menu, MenuItem, Select, Checkbox, Radio, Switch, Slider,
  Accordion, AccordionSummary, AccordionDetails, Stepper, Step, StepLabel, Fab,
  CircularProgress, LinearProgress, Skeleton, Breadcrumbs, Link, Pagination,
} from '@mui/material'
export default function App() {
  const now = dateFns.format(new Date(), 'yyyy-MM-dd')
  const nums = _.range(0, 100)
  const chunked = _.chunk(nums, 10)
  interval(1000).pipe(map((x) => x * 2), filter((x) => x > 4), take(5)).subscribe()

  return (
    <Box>
      <AppBar>
        <Toolbar>
          <Typography>{now} — {chunked.length} chunks</Typography>
          <Badge badgeContent={4}>x</Badge>
        </Toolbar>
      </AppBar>
      <Grid container>
        <Card>
          <CardContent>
            <TextField label="Search" />
            <Button variant="contained">Go</Button>
          </CardContent>
          <CardActions>
            <Chip label="tag" avatar={<Avatar>A</Avatar>} />
            <Slider defaultValue={30} />
            <CircularProgress />
          </CardActions>
        </Card>
        <Table>
          <TableHead><TableRow><TableCell>Col</TableCell></TableRow></TableHead>
          <TableBody><TableRow><TableCell>{_.sum(nums)}</TableCell></TableRow></TableBody>
        </Table>
      </Grid>
    </Box>
  )
}
