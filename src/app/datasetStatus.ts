/**
 * Dataset status shown in the header.
 *
 * This is a static description of what the app is running on. It is NOT a
 * live feed and never claims a connection to NASA services. Later parts
 * should replace this with the real state of the loaded demo dataset.
 */
export interface DatasetStatus {
  mode: 'demo'
  label: string
  detail: string
  connectedToNasa: false
}

export const DATASET_STATUS: DatasetStatus = {
  mode: 'demo',
  label: 'Demo dataset',
  detail: 'Not connected to NASA FIRMS. Sample records load in a later part.',
  connectedToNasa: false,
}
