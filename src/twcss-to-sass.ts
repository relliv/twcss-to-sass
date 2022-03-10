import { parse } from 'himalaya'
import beautifyCss, { CSSBeautifyOptions } from 'js-beautify'
import slug from 'slug'

import Utils from './utils/utils'
import { ITwToSassOptions } from './interfaces/tw-to-sass-options'
import {
  IAttribute,
  IHtmlNode,
  IHtmlNodeAttribute,
} from './interfaces/html-node'

/**
 * Default js-beautify css formatter options
 */
const formatterOptions: CSSBeautifyOptions = {
  indent_size: 4,
  indent_char: ' ',
  max_preserve_newlines: 5,
  preserve_newlines: true,
  end_with_newline: false,
  wrap_line_length: 0,
  indent_empty_lines: false,
}

/**
 * Default options
 */
let defaultOptions: ITwToSassOptions = {
  formatOutput: true,
  useCommentBlocksAsClassName: false,
  maxClassNameLength: 50,
  printComments: true,
  formatterOptions: formatterOptions,
  classNameOptions: {
    lowercase: true,
    replaceWith: '-',
    prefix: '',
    suffix: '',
  },
}

/**
 * Get style and class attributes
 *
 * @param attributes IHtmlNodeAttribute[] | null
 * @param keys string | string[]
 *
 * @returns IAttribute | null
 */
const getAttributes = function (
  attributes: IHtmlNodeAttribute[] | null,
  keys: string | string[]
): IAttribute | null {
  if (attributes) {
    if (!Array.isArray(keys)) {
      keys = [keys]
    }

    const _attributes = attributes
      .filter((attribute: IHtmlNodeAttribute) => keys.includes(attribute.key))
      .map((attribute: IHtmlNodeAttribute) => {
        attribute.value = Utils.cleanText(attribute.value)

        return attribute
      })

    if (_attributes) {
      return {
        style:
          _attributes.find((x: IHtmlNodeAttribute) => x.key == 'style')
            ?.value ?? null,
        class:
          _attributes.find((x: IHtmlNodeAttribute) => x.key == 'class')
            ?.value ?? null,
      }
    }
  }

  return null
}

/**
 * Get style contents
 *
 * @param {array} styleElements
 */
const getStyleContents = function (styleElements: IHtmlNode[]): IHtmlNode[] {
  return styleElements.map((element: IHtmlNode) => {
    const styleContents = element.children
      .filter((x: IHtmlNode) => (x.type = 'text'))
      .map((x: IHtmlNode) => x.content)
      .join('')

    return <IHtmlNode>(<unknown>{
      tagName: 'style',
      text: 'STYLE',
      filterAttributes: {
        style: styleContents,
      },
    })
  })
}

/**
 * Filter IHtmlNode array by node type and tagName
 *
 * @param {string} htmlJson
 *
 * @returns Object
 */
const filterHtmlData = function (
  htmlJson: IHtmlNode[] | IHtmlNode,
  nestedOrder = 1
): IHtmlNode[] | null {
  if (htmlJson && Array.isArray(htmlJson)) {
    const parentNode = htmlJson.filter(
        (x: IHtmlNode) =>
          (x.type == 'element' || x.type == 'comment') && x.tagName != 'style'
      ),
      styleElements = htmlJson.filter((x) => x.tagName == 'style')

    let styleList: IHtmlNode[] = []

    if (styleElements && styleElements.length) {
      styleList = getStyleContents(styleElements)
    }

    if (parentNode && parentNode.length) {
      const elementList: IHtmlNode[] | null = []

      parentNode.forEach((node: IHtmlNode) => {
        if (Array.isArray(node.children)) {
          const previousNodes = []

          // find available previous nodes
          for (let i = 0; i < parentNode.length; i++) {
            if (parentNode[i] == node) {
              if (parentNode[i - 1]) {
                previousNodes.push(parentNode[i - 1])
              }

              if (parentNode[i - 2]) {
                previousNodes.push(parentNode[i - 2])
              }

              break
            }
          }

          // get parent comment text
          node.comment = previousNodes
            .filter((x) => x.type == 'comment')
            .map((x) => Utils.cleanText(x.content, true))
            .filter((x) => x !== null)
            .reverse()
            .join(', ')

          node.order = nestedOrder

          const children: IHtmlNode[] | null = filterHtmlData(
            node.children,
            nestedOrder + 1
          )

          if (children && children.length) {
            node.children = children.filter(
              (x: IHtmlNode) => x.type == 'element'
            )
          }
        }

        // get only class and inline style attributes
        node.filterAttributes = getAttributes(node.attributes, [
          'class',
          'style',
        ])

        if (node.filterAttributes !== null || node.children !== null) {
          elementList?.push(node)
        }
      })

      if (elementList && elementList.length) {
        return [...styleList, ...elementList]
      }
    }
  }

  return null
}

/**
 * Get CSS class name from node details
 *
 * @param node IHtmlNode
 * @param deepth number
 *
 * @returns string
 */
const getClassName = function (node: IHtmlNode, deepth: number): string {
  let className = ''

  const classComment = defaultOptions.printComments
    ? `/* ${node.comment ? node.comment : node.tagName} -> ${node.order} */`
    : ''

  if (node.comment && defaultOptions.useCommentBlocksAsClassName) {
    let classSlug = defaultOptions.classNameOptions.prefix

    classSlug += slug(node.comment, {
      lower: !!defaultOptions.classNameOptions.lowercase,
      replacement: defaultOptions.classNameOptions.replaceWith,
    })

    classSlug =
      classSlug.length > defaultOptions.maxClassNameLength
        ? classSlug.substring(0, defaultOptions.maxClassNameLength)
        : classSlug

    classSlug += defaultOptions.classNameOptions.suffix

    className += `.${classSlug}`
  } else if (node.tagName != 'div') {
    className += `${node.tagName}`
  } else {
    className += `.class-${node.tagName}-${deepth}`
  }

  return classComment + className
}

/**
 * Extract SASS tree from HTML JSON tree
 *
 * @param {Object} nodeTree
 * @param {int} count
 *
 * @returns string
 */
const getSassTree = function (nodeTree: IHtmlNode[] | IHtmlNode, deepth = 0) {
  if (nodeTree) {
    let styleCount = 0

    if (!Array.isArray(nodeTree)) {
      nodeTree = nodeTree.children
    }

    return nodeTree
      .map((node: IHtmlNode) => {
        let treeSTring = '',
          subTreeSTring = ''

        if (node.filterAttributes === null && node.children === null) {
          return ''
        }

        if (Array.isArray(node.children) && node.children.length) {
          ++deepth

          subTreeSTring = getSassTree(node, deepth)
        }

        if (node.tagName == 'style' && node.filterAttributes) {
          styleCount += 1

          let result = `// #region STYLE #${styleCount}\n`
          result += `\n${node.filterAttributes.style}\n`
          result += '// #endregion\n\n'

          return result
        } else {
          if (node.filterAttributes) {
            if (node.filterAttributes.class) {
              treeSTring += node.filterAttributes.class
                ? `@apply ${node.filterAttributes.class};`
                : ''
            }

            if (node.filterAttributes.style) {
              node.filterAttributes.style = Utils.addMissingSuffix(
                node.filterAttributes.style,
                ';'
              )
              treeSTring += node.filterAttributes.style
                ? `\n${node.filterAttributes.style}\n`
                : ''
            }
          }

          if (treeSTring.length || subTreeSTring.length) {
            let result = getClassName(node, deepth)

            result += `{${treeSTring}${subTreeSTring}}`

            return result
          }
        }

        return null
      })
      .join('')
  }

  return ''
}

/**
 * Convert HMTL to SASS
 *
 * @param {string} html
 * @param {ITwToSassOptions} options
 *
 * @returns string
 */
export const convertToSass = function (
  html: string,
  options: ITwToSassOptions | null = null
): null | string {
  if (html && html.length) {
    if (options) {
      defaultOptions = {
        ...defaultOptions,
        ...options,
      }
    }

    html = Utils.cleanText(html)

    const htmlJson: IHtmlNode[] | IHtmlNode = parse(html)

    const filteredHtmlData = filterHtmlData(htmlJson)

    if (filteredHtmlData) {
      const sassTreeResult = getSassTree(filteredHtmlData)

      // export with formatted output
      if (defaultOptions.formatOutput === true) {
        const formattedResult = beautifyCss.css(
          sassTreeResult,
          defaultOptions.formatterOptions
        )

        return Utils.fixFomatterApplyIssue(formattedResult)
      }

      return sassTreeResult
    }
  }

  return null
}