import { join } from 'path'
import type { BrowserWindowConstructorOptions } from 'electron'

export function windowIconOptions(packaged: boolean, appPath: string): Pick<BrowserWindowConstructorOptions, 'icon'> {
  return packaged ? {} : { icon: join(appPath, 'build', 'icon.ico') }
}
