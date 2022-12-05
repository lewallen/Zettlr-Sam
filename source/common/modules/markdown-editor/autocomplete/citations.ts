/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Citation Autocomplete
 * CVM-Role:        Autocomplete Plugin
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     This plugin manages citations.
 *
 * END HEADER
 */

import { Completion } from '@codemirror/autocomplete'
import { StateEffect, StateField } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { AutocompletePlugin } from '.'
import { configField } from '../util/configuration'

/**
 * Use this effect to provide the editor state with a set of new citekeys
 */
export const citekeyUpdate = StateEffect.define<Array<{ citekey: string, displayText: string }>>()
export const citekeyUpdateField = StateField.define<Completion[]>({
  create (state) {
    return []
  },
  update (val, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(citekeyUpdate)) {
        // Convert the citationentries into completion objects
        return effect.value.map(entry => {
          return {
            label: entry.citekey,
            info: entry.displayText,
            apply
          }
        })
      }
    }
    return val
  }
})

/**
 * This utility function just takes a citekey and ensures that the way the
 * completion is applied matches the settings on the editor instance.
 *
 * @param   {string}      infoString  The infostring to use
 */
const apply = function (view: EditorView, completion: Completion, from: number, to: number): void {
  const citeStyle = view.state.field(configField).citeStyle
  const lineObject = view.state.doc.lineAt(from)
  const line = lineObject.text
  const fromCh = from - lineObject.from
  const toCh = to - lineObject.from

  const afterOpen = line.lastIndexOf('[', fromCh) > line.lastIndexOf(']', fromCh)
  // Either no open and 1 close bracket or a close bracket after an open bracket
  const beforeClose = (!line.includes('[', toCh) && line.includes(']', toCh)) || (line.indexOf(']', toCh) < line.indexOf('[', toCh))
  const noBrackets = !afterOpen && !beforeClose

  if (citeStyle === 'regular' && noBrackets) {
    const insert = `[@${completion.label}]`
    view.dispatch({
      // Minus 1 is important since we have to overwrite the @-sign with [@
      changes: [{ from: from - 1, to, insert }],
      selection: { anchor: from - 1 + insert.length - 1 } // Between citekey and ]
    })
  } else if (citeStyle === 'in-text-suffix' && noBrackets) {
    // We should add square brackets after the completion text
    const insert = `${completion.label} []`
    view.dispatch({
      changes: [{ from, to, insert }],
      selection: { anchor: from + insert.length - 1 } // Inside []
    })
  } else {
    // Otherwise: citeStyle was in-text or there were brackets surrounding the
    // citekey, so we can simply replace it
    const insert = String(completion.label)
    view.dispatch({ changes: [{ from, to, insert }], selection: { anchor: from + insert.length } })
  }
}

export const citations: AutocompletePlugin = {
  applies (ctx) {
    // A valid citekey position is: Beginning of the line (citekey without square
    // brackets), after a square bracket open (regular citation without prefix),
    // or after a space (either a standalone citation or within square brackets
    // but with a prefix). Also, the citekey can be prefixed with a -.
    const { text, from } = ctx.state.doc.lineAt(ctx.pos)
    const textBefore = text.slice(0, ctx.pos - from)
    if (text.startsWith('@') && ctx.pos - from === 1) {
      // The line starts with an @ and the cursor is directly behind it
      return ctx.pos
    } else if (/(?<=[-[\s])@[^[\]]*$/.test(textBefore)) {
      // The text immediately before the cursor matches a valid citation
      return from + textBefore.lastIndexOf('@') + 1
    } else {
      // Nopey
      return false
    }
  },
  entries (ctx, query) {
    query = query.toLowerCase()
    const entries = ctx.state.field(citekeyUpdateField)
    return entries.filter(entry => {
      return entry.label.toLowerCase().includes(query) || (entry.info as string|undefined)?.toLowerCase().includes(query)
    })
  },
  fields: [citekeyUpdateField]
}