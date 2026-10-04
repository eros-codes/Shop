enum AttributeTypeEnum {
  // Chosen from a fixed list the admin defines: colour, size, storage.
  Select = 'select',
  // A select whose options also carry a hex code, so a storefront can
  // draw swatches instead of printing the word "navy".
  Color = 'color',
  // Descriptive only: screen size, weight of a garment, SPF.
  Number = 'number',
  Text = 'text',
  Boolean = 'boolean',
}

export default AttributeTypeEnum;
