/*  eslint no-magic-numbers: [0]  */

import * as AST from './ast';
import { FTLParserStream } from './ftlstream';
import { ParseError } from './errors';


function withSpan(fn) {
  return function(ps, ...args) {
    if (!this.withSpans) {
      return fn.call(this, ps, ...args);
    }

    let start = ps.getIndex();
    const node = fn.call(this, ps, ...args);

    // Don't re-add the span if the node already has it.  This may happen when
    // one decorated function calls another decorated function.
    if (node.span) {
      return node;
    }

    // Spans of Messages and Sections should include the attached Comment.
    if (node.type === 'Message' || node.type === 'Section') {
      if (node.comment !== null) {
        start = node.comment.span.start;
      }
    }

    const end = ps.getIndex();
    node.addSpan(start, end);
    return node;
  };
}


export default class FluentParser {
  constructor({
    withSpans = true,
  } = {}) {
    this.withSpans = withSpans;

    // Poor man's decorators.
    [
      'getComment', 'getSection', 'getMessage', 'getAttribute', 'getTag',
      'getIdentifier', 'getVariant', 'getSymbol', 'getNumber', 'getPattern',
      'getTextElement', 'getPlaceable', 'getExpression',
      'getSelectorExpression', 'getCallArg', 'getString', 'getLiteral',
    ].forEach(
      name => this[name] = withSpan(this[name])
    );
  }

  parse(source) {
    let comment = null;

    const ps = new FTLParserStream(source);
    ps.skipBlankLines();

    const entries = [];

    while (ps.current()) {
      const entry = this.getEntryOrJunk(ps);

      if (entry.type === 'Comment' && entries.length === 0) {
        comment = entry;
      } else {
        entries.push(entry);
      }

      ps.skipBlankLines();
    }

    const res = new AST.Resource(entries, comment);

    if (this.withSpans) {
      res.addSpan(0, ps.getIndex());
    }

    return res;
  }

  parseEntry(source) {
    const ps = new FTLParserStream(source);
    ps.skipBlankLines();
    return this.getEntryOrJunk(ps);
  }

  getEntryOrJunk(ps) {
    const entryStartPos = ps.getIndex();

    try {
      const entry = this.getEntry(ps);
      if (this.withSpans) {
        entry.addSpan(entryStartPos, ps.getIndex());
      }
      return entry;
    } catch (err) {
      if (!(err instanceof ParseError)) {
        throw err;
      }

      const errorIndex = ps.getIndex();
      ps.skipToNextEntryStart();
      const nextEntryStart = ps.getIndex();

      // Create a Junk instance
      const slice = ps.getSlice(entryStartPos, nextEntryStart);
      const junk = new AST.Junk(slice);
      if (this.withSpans) {
        junk.addSpan(entryStartPos, nextEntryStart);
      }
      const annot = new AST.Annotation(err.code, err.args, err.message);
      annot.addSpan(errorIndex, errorIndex);
      junk.addAnnotation(annot);
      return junk;
    }
  }

  getEntry(ps) {
    let comment;

    if (ps.currentIs('/')) {
      comment = this.getComment(ps);
    }

    if (ps.currentIs('[')) {
      return this.getSection(ps, comment);
    }

    if (ps.isIDStart()) {
      return this.getMessage(ps, comment);
    }

    if (comment) {
      return comment;
    }
    throw new ParseError('E0002');
  }

  getComment(ps) {
    ps.expectChar('/');
    ps.expectChar('/');
    ps.takeCharIf(' ');

    let content = '';

    while (true) {
      let ch;
      while ((ch = ps.takeChar(x => x !== '\n'))) {
        content += ch;
      }

      ps.next();

      if (ps.currentIs('/')) {
        content += '\n';
        ps.next();
        ps.expectChar('/');
        ps.takeCharIf(' ');
      } else {
        break;
      }
    }
    return new AST.Comment(content);
  }

  getSection(ps, comment) {
    ps.expectChar('[');
    ps.expectChar('[');

    ps.skipInlineWS();

    const symb = this.getSymbol(ps);

    ps.skipInlineWS();

    ps.expectChar(']');
    ps.expectChar(']');

    ps.skipInlineWS();

    ps.expectChar('\n');

    return new AST.Section(symb, comment);
  }

  getMessage(ps, comment) {
    const id = this.getIdentifier(ps);

    ps.skipInlineWS();

    let pattern;
    let attrs;
    let tags;

    if (ps.currentIs('=')) {
      ps.next();
      ps.skipInlineWS();
      ps.skipBlankLines();

      pattern = this.getPattern(ps);
    }

    if (ps.isPeekNextLineAttributeStart()) {
      attrs = this.getAttributes(ps);
    }

    if (ps.isPeekNextLineTagStart()) {
      if (attrs !== undefined) {
        throw new ParseError('E0012');
      }
      tags = this.getTags(ps);
    }

    if (pattern === undefined && attrs === undefined) {
      throw new ParseError('E0005', id.name);
    }

    return new AST.Message(id, pattern, attrs, tags, comment);
  }

  getAttribute(ps) {
    ps.expectChar('.');

    const key = this.getIdentifier(ps);

    ps.skipInlineWS();
    ps.expectChar('=');
    ps.skipInlineWS();

    const value = this.getPattern(ps);

    if (value === undefined) {
      throw new ParseError('E0006', 'value');
    }

    return new AST.Attribute(key, value);
  }

  getAttributes(ps) {
    const attrs = [];

    while (true) {
      ps.expectIndent();

      const attr = this.getAttribute(ps);
      attrs.push(attr);

      if (!ps.isPeekNextLineAttributeStart()) {
        break;
      }
    }
    return attrs;
  }

  getTag(ps) {
    ps.expectChar('#');
    const symb = this.getSymbol(ps);
    return new AST.Tag(symb);
  }

  getTags(ps) {
    const tags = [];

    while (true) {
      ps.expectIndent();

      const tag = this.getTag(ps);
      tags.push(tag);

      if (!ps.isPeekNextLineTagStart()) {
        break;
      }
    }
    return tags;
  }

  getIdentifier(ps) {
    let name = '';

    name += ps.takeIDStart();

    let ch;
    while ((ch = ps.takeIDChar())) {
      name += ch;
    }

    return new AST.Identifier(name);
  }

  getVariantKey(ps) {
    const ch = ps.current();

    if (!ch) {
      throw new ParseError('E0013');
    }

    const cc = ch.charCodeAt(0);

    if ((cc >= 48 && cc <= 57) || cc === 45) { // 0-9, -
      return this.getNumber(ps);
    }

    return this.getSymbol(ps);
  }

  getVariant(ps, hasDefault) {
    let defaultIndex = false;

    if (ps.currentIs('*')) {
      if (hasDefault) {
        throw new ParseError('E0015');
      }
      ps.next();
      defaultIndex = true;
      hasDefault = true;
    }

    ps.expectChar('[');

    const key = this.getVariantKey(ps);

    ps.expectChar(']');

    ps.skipInlineWS();

    const value = this.getPattern(ps);

    if (!value) {
      throw new ParseError('E0006', 'value');
    }

    return new AST.Variant(key, value, defaultIndex);
  }

  getVariants(ps) {
    const variants = [];
    let hasDefault = false;

    while (true) {
      ps.expectIndent();

      const variant = this.getVariant(ps, hasDefault);

      if (variant.default) {
        hasDefault = true;
      }

      variants.push(variant);

      if (!ps.isPeekNextLineVariantStart()) {
        break;
      }
    }

    if (!hasDefault) {
      throw new ParseError('E0010');
    }

    return variants;
  }

  getSymbol(ps) {
    let name = '';

    name += ps.takeIDStart();

    while (true) {
      const ch = ps.takeSymbChar();
      if (ch) {
        name += ch;
      } else {
        break;
      }
    }

    return new AST.Symbol(name.trimRight());
  }

  getDigits(ps) {
    let num = '';

    let ch;
    while ((ch = ps.takeDigit())) {
      num += ch;
    }

    if (num.length === 0) {
      throw new ParseError('E0004', '0-9');
    }

    return num;
  }

  getNumber(ps) {
    let num = '';

    if (ps.currentIs('-')) {
      num += '-';
      ps.next();
    }

    num = `${num}${this.getDigits(ps)}`;

    if (ps.currentIs('.')) {
      num += '.';
      ps.next();
      num = `${num}${this.getDigits(ps)}`;
    }

    return new AST.NumberExpression(num);
  }

  getPattern(ps) {
    const elements = [];
    ps.skipInlineWS();

    // Special-case: trim leading whitespace and newlines.
    if (ps.isPeekNextNonBlankLinePattern()) {
      ps.skipBlankLines();
      ps.skipInlineWS();
    }

    let ch;
    while ((ch = ps.current())) {

      // The end condition for getPattern's while loop is a newline
      // which is not followed by a valid pattern continuation.
      if (ch === '\n' && !ps.isPeekNextNonBlankLinePattern()) {
        break;
      }

      if (ch === '{') {
        const element = this.getPlaceable(ps);
        elements.push(element);
      } else {
        const element = this.getTextElement(ps);
        elements.push(element);
      }
    }

    return new AST.Pattern(elements);
  }

  getTextElement(ps) {
    let buffer = '';

    let ch;
    while ((ch = ps.current())) {

      if (ch === '{') {
        return new AST.TextElement(buffer);
      }

      if (ch === '\n') {
        if (!ps.isPeekNextNonBlankLinePattern()) {
          return new AST.TextElement(buffer);
        }

        ps.next();
        ps.skipInlineWS();

        // Add the new line to the buffer
        buffer += ch;
        continue;
      }

      if (ch === '\\') {
        const ch2 = ps.next();

        if (ch2 === '{' || ch2 === '"') {
          buffer += ch2;
        } else {
          buffer += ch + ch2;
        }

      } else {
        buffer += ps.ch;
      }

      ps.next();
    }

    return new AST.TextElement(buffer);
  }

  getPlaceable(ps) {
    ps.expectChar('{');
    const expression = this.getExpression(ps);
    ps.expectChar('}');
    return new AST.Placeable(expression);
  }

  getExpression(ps) {
    if (ps.isPeekNextLineVariantStart()) {
      const variants = this.getVariants(ps);

      ps.expectIndent();

      return new AST.SelectExpression(null, variants);
    }

    ps.skipInlineWS();

    const selector = this.getSelectorExpression(ps);

    ps.skipInlineWS();

    if (ps.currentIs('-')) {
      ps.peek();
      if (!ps.currentPeekIs('>')) {
        ps.resetPeek();
      } else {
        ps.next();
        ps.next();

        ps.skipInlineWS();

        const variants = this.getVariants(ps);


        if (variants.length === 0) {
          throw new ParseError('E0011');
        }

        ps.expectIndent();

        return new AST.SelectExpression(selector, variants);
      }
    }

    return selector;
  }

  getSelectorExpression(ps) {
    const literal = this.getLiteral(ps);

    if (literal.type !== 'MessageReference') {
      return literal;
    }

    const ch = ps.current();

    if (ch === '.') {
      ps.next();

      const attr = this.getIdentifier(ps);
      return new AST.AttributeExpression(literal.id, attr);
    }

    if (ch === '[') {
      ps.next();

      const key = this.getVariantKey(ps);

      ps.expectChar(']');

      return new AST.VariantExpression(literal.id, key);
    }

    if (ch === '(') {
      ps.next();

      const args = this.getCallArgs(ps);

      ps.expectChar(')');

      if (!/^[A-Z_-]+$/.test(literal.id.name)) {
        throw new ParseError('E0008');
      }

      return new AST.CallExpression(
        new AST.Function(literal.id.name),
        args
      );
    }

    return literal;
  }

  getCallArg(ps) {
    const exp = this.getSelectorExpression(ps);

    ps.skipInlineWS();

    if (ps.current() !== ':') {
      return exp;
    }

    if (exp.type !== 'MessageReference') {
      throw new ParseError('E0009');
    }

    ps.next();
    ps.skipInlineWS();

    const val = this.getArgVal(ps);

    return new AST.NamedArgument(exp.id, val);
  }

  getCallArgs(ps) {
    const args = [];

    ps.skipInlineWS();

    while (true) {
      if (ps.current() === ')') {
        break;
      }

      const arg = this.getCallArg(ps);
      args.push(arg);

      ps.skipInlineWS();

      if (ps.current() === ',') {
        ps.next();
        ps.skipInlineWS();
        continue;
      } else {
        break;
      }
    }
    return args;
  }

  getArgVal(ps) {
    if (ps.isNumberStart()) {
      return this.getNumber(ps);
    } else if (ps.currentIs('"')) {
      return this.getString(ps);
    }
    throw new ParseError('E0006', 'value');
  }

  getString(ps) {
    let val = '';

    ps.expectChar('"');

    let ch;
    while ((ch = ps.takeChar(x => x !== '"'))) {
      val += ch;
    }

    ps.next();

    return new AST.StringExpression(val);

  }

  getLiteral(ps) {
    const ch = ps.current();

    if (!ch) {
      throw new ParseError('E0014');
    }

    if (ps.isNumberStart()) {
      return this.getNumber(ps);
    } else if (ch === '"') {
      return this.getString(ps);
    } else if (ch === '$') {
      ps.next();
      const name = this.getIdentifier(ps);
      return new AST.ExternalArgument(name);
    }

    const name = this.getIdentifier(ps);
    return new AST.MessageReference(name);
  }
}
