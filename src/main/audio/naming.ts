import type { DeviceProfile } from '../profiles/types'
import type { NamingOptions } from '../../shared/ipc'

const OUTPUT_EXT = '.wav'

/** naming.allowedCharsRegex is authored as `^[...]+$` (see profile JSON) —
 *  this pulls the character class out so individual characters can be
 *  tested against it while sanitizing. */
function charClassFromPattern(pattern: string): RegExp {
  const match = pattern.match(/\[(.+)\]/)
  return new RegExp(`[${match ? match[1] : 'A-Za-z0-9_-'}]`)
}

// Combining diacritical marks (U+0300-U+036F) left behind by NFKD
// normalization once the base Latin letter has been split out.
const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

function stripDiacritics(input: string): string {
  return input.normalize('NFKD').replace(COMBINING_DIACRITICS, '')
}

function baseName(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

/** Sanitizes a bare filename (no extension) against a profile's naming
 *  rules: ASCII-folds if required, replaces disallowed characters with
 *  underscores, and trims to the profile's max length (reserving room for
 *  the .wav extension all outputs get). */
export function sanitizeBaseName(name: string, profile: DeviceProfile): string {
  let result = profile.naming.asciiOnly ? stripDiacritics(name).replace(/[^\x00-\x7F]/g, '') : name

  const charClass = charClassFromPattern(profile.naming.allowedCharsRegex)
  result = Array.from(result)
    .map((ch) => (charClass.test(ch) ? ch : '_'))
    .join('')
  result = result.replace(/_+/g, '_').replace(/^[_\s]+|[_\s]+$/g, '')
  if (!result) result = 'sample'

  const maxBaseLength = Math.max(1, profile.naming.maxLength - OUTPUT_EXT.length)
  return result.slice(0, maxBaseLength)
}

export function isNameCompliant(filename: string, profile: DeviceProfile): boolean {
  const name = baseName(filename)
  const sanitized = sanitizeBaseName(name, profile)
  return sanitized === name && filename.toLowerCase().endsWith(OUTPUT_EXT)
}

/** Builds the final output filename for one source file: applies the
 *  naming-options prefix/numbering, re-sanitizes the assembled name (a
 *  prefix could itself introduce disallowed characters), then dedupes
 *  against every name already claimed in this run or already present in
 *  the output workspace. `claimed` is mutated as names are assigned. */
export function buildOutputFilename(
  sourceFilename: string,
  index: number,
  profile: DeviceProfile,
  naming: NamingOptions,
  claimed: Set<string>
): string {
  const sanitizedSource = sanitizeBaseName(baseName(sourceFilename), profile)
  const number = naming.numbering === 'sequential' ? naming.startNumber + index : null
  const numberPart = number !== null ? `${String(number).padStart(3, '0')}_` : ''
  const assembled = sanitizeBaseName(`${naming.prefix}${numberPart}${sanitizedSource}`, profile)

  const maxBaseLength = Math.max(1, profile.naming.maxLength - OUTPUT_EXT.length)
  let candidate = `${assembled}${OUTPUT_EXT}`
  let suffix = 1
  while (claimed.has(candidate.toLowerCase())) {
    const suffixText = `_${suffix}`
    const truncatedBase = assembled.slice(0, Math.max(1, maxBaseLength - suffixText.length))
    candidate = `${truncatedBase}${suffixText}${OUTPUT_EXT}`
    suffix++
  }
  claimed.add(candidate.toLowerCase())
  return candidate
}
