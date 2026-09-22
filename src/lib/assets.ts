/** Works under the GitHub Pages project path and in the Node PDF renderer. */
export function assetUrl(path: string): string {
  return `${import.meta.env?.BASE_URL ?? '/'}${path.replace(/^\//, '')}`;
}
