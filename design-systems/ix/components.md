<!-- Generated from @siemens/ix 5.3.0 by scripts/gen-ix-catalog.mjs. Do not edit by hand. -->
# Siemens iX 5.3.0: component reference

Attributes are written in kebab-case in HTML. Boolean attributes: present = true (`<ix-button outline>`).
Only these tags exist. Do not invent others.

### `<ix-action-card>`
- `heading`: string — Card heading
- `icon`: string — Card icon
- `passive`: boolean
- `selected`: boolean — Card selection
- `subheading`: string — Card subheading
- `variant`: 'alarm' | 'critical' | 'warning' | 'info' | 'neutral' | 'success' | 'primary' | 'outline' | 'filled' = 'outline' — Card variant

### `<ix-application>`
- `color-schema`: 'light' | 'dark' | 'system' = 'system' — Color schema of the theme
- `theme`: string — Application theme

### `<ix-application-header>`
- `app-icon`: string
- `app-icon-alt`: string — Alt text for the app icon
- `app-icon-outline`: boolean — Render subtle outline around app icon to ensure proper contrast.
- `company-logo`: string
- `company-logo-alt`: string — Alt text for the company logo
- `hide-bottom-border`: boolean — Hides the bottom border of the header
- `name`: string — Application name
- `name-suffix`: string — Define a suffix which will be displayed next to the application name
- `show-menu`: boolean

### `<ix-avatar>`
- `extra`: string
- `image`: string — Display an avatar image
- `initials`: string — Display the initials of the user. Will be overwritten by image
- `username`: string

### `<ix-badge>`
- `align-left`: boolean
- `background`: string
- `badge-color`: string — Custom text color. Only has an effect when **variant** is `custom`.
- `border`: boolean
- `enable-animation`: boolean
- `icon`: string — Leading icon name. Only has an effect when **type** is `label`.
- `label`: string
- `offset-x`: number
- `offset-y`: number
- `outline`: boolean — Show the badge in outline style.
- `position`: BadgePosition = 'top-after'
- `type`: BadgeAnatomyType = 'counter' — Badge type (`counter`, `label`, `dot`, or `status-icon`).
- `variant`: BadgeVariant = 'primary'

### `<ix-blind>`
- `collapsed`: boolean — Collapsed state
- `icon`: string — Optional icon to be displayed next to the header label
- `label`: string — Label of blind
- `sublabel`: string — Secondary label inside blind header
- `variant`: 'alarm' | 'critical' | 'warning' | 'info' | 'neutral' | 'success' | 'primary' | 'outline' | 'filled' = 'filled' — Blind variant

### `<ix-breadcrumb>`
- `subtle`: boolean
- `visible-item-count`: number = 9 — Excess items will get hidden inside of dropdown

### `<ix-breadcrumb-item>`
- `breadcrumb-key`: string
- `hide-chevron`: boolean
- `href`: string
- `icon`: string — Icon to be displayed next ot the label
- `invisible`: boolean
- `is-current-page`: boolean
- `is-dropdown-trigger`: boolean
- `label`: string — Breadcrumb label
- `subtle`: boolean

### `<ix-button>`
- `disabled`: boolean — Disable the button
- `href`: string
- `icon`: string — Icon name
- `icon-right`: string — Icon name for the right side of the button
- `loading`: boolean — Loading button
- `type`: 'button' | 'submit' = 'button' — Type of the button
- `variant`: 'primary' | 'secondary' | 'tertiary' | 'subtle-primary' | 'subtle-secondary' | 'subtle-tertiary' | 'danger-primary' | 'danger-secondary' | 'danger-tertiary' = 'primary' — Button variant

### `<ix-card>`
- `passive`: boolean
- `selected`: boolean — Show card in selected state
- `variant`: 'alarm' | 'critical' | 'warning' | 'info' | 'neutral' | 'success' | 'primary' | 'outline' | 'filled' = 'outline' — Card variant

### `<ix-card-accordion>`
- `collapse`: boolean — Collapse the card
- `variant`: 'alarm' | 'critical' | 'warning' | 'info' | 'neutral' | 'success' | 'primary' | 'outline' | 'filled' = 'outline' — Show accordion with different color variants

### `<ix-card-content>`
- (no attributes; use slots/children)

### `<ix-card-list>`
- `collapse`: boolean — Collapse the list
- `hide-show-all`: boolean — Hide the show all button
- `label`: string — Name the card list
- `list-style`: 'stack' | 'scroll' = 'stack' — List style
- `max-visible-cards`: number = 12 — Maximal visible cards
- `show-all-count`: number — Overwrite the default show all count.

### `<ix-card-title>`
- (no attributes; use slots/children)

### `<ix-category-filter>`
- `categories`: { [id: string]: { label: string

### `<ix-checkbox>`
- `checked`: boolean — Checked state of the checkbox component
- `disabled`: boolean — Disabled state of the checkbox component
- `indeterminate`: boolean — Indeterminate state of the checkbox component
- `label`: string — Label for the checkbox component
- `name`: string — Name of the checkbox component
- `required`: boolean
- `value`: string = 'on' — Value of the checkbox component

### `<ix-checkbox-group>`
- `direction`: 'row' | 'column' = 'column' — Alignment of the checkboxes in the group
- `helper-text`: string — Optional helper text displayed below the checkbox group
- `info-text`: string — Info text for the checkbox group
- `invalid-text`: string — Error text for the checkbox group
- `label`: string — Label for the checkbox group
- `required`: boolean
- `show-text-as-tooltip`: boolean — Show helper, info, warning, error and valid text as tooltip
- `valid-text`: string — Valid text for the checkbox group
- `warning-text`: string — Warning text for the checkbox group

### `<ix-chip>`
- `background`: string
- `center-content`: boolean — Center the content of the chip. Set to false to disable centering.
- `chip-color`: string
- `closable`: boolean — Show close icon
- `icon`: string — Show icon
- `inactive`: boolean
- `outline`: boolean — Show chip with outline style
- `variant`: ChipVariant = 'primary'

### `<ix-col>`
- `size`: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | 'auto' — Size of the column
- `size-lg`: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | 'auto' — Size of the column for lg screens
- `size-md`: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | 'auto' — Size of the column for md screens
- `size-sm`: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | 'auto' — Size of the column for sm screens

### `<ix-content>`
- (no attributes; use slots/children)

### `<ix-content-header>`
- `has-back-button`: boolean — Display a back button
- `header-subtitle`: string — Subtitle of Header
- `header-title`: string — Title of Header
- `variant`: 'primary' | 'secondary' = 'primary' — Variant of content header

### `<ix-custom-field>`
- `helper-text`: string — Show text below the field component which show additional information
- `info-text`: string — Info text for the field component
- `invalid-text`: string — Error text for the field component
- `label`: string — Label for the field component
- `required`: boolean — A value is required or must be checked for the form to be submittable
- `show-text-as-tooltip`: boolean — Show helper, info, warning, error and valid text as tooltip
- `valid-text`: string — Valid text for the field component
- `warning-text`: string — Warning text for the field component

### `<ix-date-dropdown>`
- `date-range-id`: string = 'custom'
- `disabled`: boolean
- `format`: string = 'yyyy/LL/dd'
- `from`: string
- `loading`: boolean — Loading button
- `locale`: string — Locale identifier (e.g. 'en' or 'de').
- `max-date`: string
- `min-date`: string
- `show-week-numbers`: boolean — Shows week numbers displayed on the left side of the date picker
- `single-selection`: boolean — If true disables date range selection (from/to).
- `to`: string
- `today`: string = DateTime.now().toISO()
- `variant`: ButtonVariant1 = 'primary' — Button variant
- `week-start-index`: number

### `<ix-date-input>`
- `disabled`: boolean — Disabled attribute.
- `format`: string = 'yyyy/LL/dd'
- `helper-text`: string — Helper text below the input field.
- `info-text`: string — Info text below the input field.
- `invalid-text`: string — Error text below the input field.
- `label`: string — Label of the input field.
- `locale`: string
- `max-date`: string
- `min-date`: string
- `name`: string — Name of the input element.
- `placeholder`: string — Placeholder of the input element.
- `readonly`: boolean — Readonly attribute.
- `required`: boolean — Required attribute.
- `show-text-as-tooltip`: boolean — Show text as tooltip.
- `show-week-numbers`: boolean — Shows week numbers displayed on the left side of the date picker.
- `text-alignment`: 'start' | 'end' = 'start'
- `valid-text`: string — Valid text below the input field.
- `value`: string — Value of the input element.
- `warning-text`: string — Warning text below the input field.
- `week-start-index`: number

### `<ix-datetime-input>`
- `disabled`: boolean — Whether the input is disabled
- `format`: string = 'yyyy/LL/dd HH:mm:ss'
- `helper-text`: string — Helper text displayed below the input
- `info-text`: string — Informational message
- `invalid-text`: string — Validation message for invalid state
- `label`: string — Label text displayed above the input
- `locale`: string — Locale for date/time formatting (e.g., 'en-US', 'de-DE')
- `max-date`: string
- `max-time`: string
- `min-date`: string
- `min-time`: string
- `name`: string — Name of the form control for form submission
- `placeholder`: string — Placeholder text when input is empty
- `readonly`: boolean — Whether the input is read-only (calendar icon hidden)
- `required`: boolean — Whether the field is required
- `show-text-as-tooltip`: boolean — Show helper text as tooltip instead of below input
- `show-week-numbers`: boolean — Show week numbers in date picker
- `text-alignment`: 'start' | 'end' = 'start' — Text alignment within the input field
- `valid-text`: string — Success/valid message
- `value`: string
- `warning-text`: string — Warning message
- `week-start-index`: number — First day of week (0=Sunday, 1=Monday, etc.)

### `<ix-divider>`
- (no attributes; use slots/children)

### `<ix-dropdown>`
- `anchor`: ElementReference — Define an anchor element
- `close-behavior`: CloseBehavior = 'both'
- `disable-focus-handling`: boolean — Suppress automatic focus when the dropdown is shown
- `disable-focus-trap`: boolean
- `discover-all-submenus`: boolean
- `focus-checked-item`: boolean
- `header`: string — An optional header shown at the top of the dropdown
- `ignore-related-submenu`: boolean
- `offset`: { mainAxis?: number — Move dropdown along main axis of alignment
- `placement`: 'top-start' | 'top-end' | 'right-start' | 'right-end' | 'bottom-start' | 'bottom-end' | 'left-start' | 'left-end' = 'bottom-start' — Placement of the dropdown
- `show`: boolean — Show dropdown
- `trigger`: ElementReference

### `<ix-dropdown-button>`
- `close-behavior`: 'inside' | 'outside' | 'both' | boolean = 'both'
- `disabled`: boolean — Disable button
- `focus-checked-item`: boolean
- `icon`: string — Button icon
- `label`: string | null — Set label
- `placement`: 'top-start' | 'top-end' | 'right-start' | 'right-end' | 'bottom-start' | 'bottom-end' | 'left-start' | 'left-end' — Placement of the dropdown
- `variant`: 'primary' | 'secondary' | 'tertiary' | 'subtle-primary' | 'subtle-secondary' | 'subtle-tertiary' | 'danger-primary' | 'danger-secondary' | 'danger-tertiary' = 'primary' — Button variant

### `<ix-dropdown-header>`
- `label`: string — Display name of the header

### `<ix-dropdown-item>`
- `checked`: boolean
- `disable-aria-select-handling`: boolean
- `disabled`: boolean — Disable item and remove event listeners
- `has-visual-focus`: boolean
- `hover`: boolean — Display hover state
- `icon`: string — Icon of dropdown item
- `is-sub-menu`: boolean
- `item-role`: 'menuitem' | 'option' = 'menuitem'
- `ix-focus-visible`: boolean
- `label`: string — Label of dropdown item

### `<ix-empty-state>`
- `action`: string — Optional empty state action
- `header`: string — Empty state header
- `icon`: string — Optional empty state icon
- `layout`: 'large' | 'compact' | 'compactBreak' = 'large'
- `sub-header`: string — Optional empty state sub header

### `<ix-event-list>`
- `animated`: boolean — Animate state change transitions. Defaults to 'false'.
- `chevron`: boolean — Display a chevron icon in list items. Defaults to 'false'
- `compact`: boolean — Make event-list items more compact
- `item-height`: 'S' | 'L' | number = 'S'

### `<ix-event-list-item>`
- `chevron`: boolean — Show chevron on right side of the event list item
- `disabled`: boolean — Disable event list item
- `item-color`: string
- `selected`: boolean — Show event list item as selected
- `variant`: 'outline' | 'filled' = 'outline' — Variant of the event list item

### `<ix-expanding-search>`
- `full-width`: boolean
- `icon`: string — Search icon
- `placeholder`: string = 'Enter text here' — Placeholder text
- `value`: string — Default value
- `variant`: ButtonVariant1 = 'tertiary' — button variant

### `<ix-field-label>`
- `html-for`: string — The id of the form element that the label is associated with
- `is-invalid`: boolean
- `required`: boolean — A value is required or must be checked for the form to be submittable

### `<ix-filter-chip>`
- `disabled`: boolean — If true the filter chip will be in disabled state
- `hide-close-button`: boolean
- `readonly`: boolean — If true the filter chip will be in readonly mode

### `<ix-group>`
- `expand-on-header-click`: boolean — Expand the group if the header is clicked
- `expanded`: boolean — Whether the group is expanded or collapsed. Defaults to false.
- `header`: string — Group header
- `index`: number
- `selected`: boolean — Whether the group is selected.
- `sub-header`: string — Group header subtitle

### `<ix-group-item>`
- `disabled`: boolean
- `group-footer`: boolean
- `icon`: string — Group item icon
- `index`: number — Index
- `secondary-text`: string — Group item secondary text
- `selected`: boolean — Show selected state
- `text`: string — Group item text

### `<ix-helper-text>`
- `helper-text`: string — Show text below the field component
- `html-for`: string — The id of the form element that the label is associated with
- `info-text`: string — Info text for the field component
- `invalid-text`: string — Error text for the field component
- `valid-text`: string — Valid text for the field component
- `warning-text`: string — Warning text for the field component

### `<ix-icon-button>`
- `disabled`: boolean — Disabled
- `icon`: string — Icon name
- `icon-color`: string — Color of icon in  button
- `loading`: boolean — Loading button
- `oval`: boolean — Button in oval shape
- `size`: '24' | '16' | '12' = '24' — Size of icon in button
- `type`: 'button' | 'submit' = 'button' — Type of the button
- `variant`: 'primary' | 'secondary' | 'tertiary' | 'subtle-primary' | 'subtle-secondary' | 'subtle-tertiary' | 'danger-primary' | 'danger-secondary' | 'danger-tertiary' = 'subtle-primary' — Variant of button

### `<ix-icon-toggle-button>`
- `disabled`: boolean — Disable the button
- `ghost`: boolean — Button with no background or outline
- `icon`: string — Icon name
- `loading`: boolean — Loading button
- `outline`: boolean — Outline button
- `oval`: boolean — Button in oval shape
- `pressed`: boolean — Show button as pressed
- `size`: '24' | '16' | '12' = '24' — Size of icon in button
- `variant`: ButtonVariant1 = 'subtle-primary' — Button variant.

### `<ix-input>`
- `allowed-characters-pattern`: string — The allowed characters pattern for the text field.
- `disabled`: boolean — Specifies whether the text field is disabled.
- `helper-text`: string — The helper text for the text field.
- `info-text`: string — The info text for the text field.
- `invalid-text`: string — The error text for the text field.
- `label`: string — The label for the text field.
- `max-length`: number — The maximum length of the text field.
- `min-length`: number — The minimum length of the text field.
- `name`: string — The name of the text field.
- `pattern`: string — The pattern for the text field.
- `placeholder`: string — The placeholder text for the text field.
- `readonly`: boolean — Specifies whether the text field is readonly.
- `required`: boolean — Specifies whether the text field is required.
- `show-text-as-tooltip`: boolean — Specifies whether to show the text as a tooltip.
- `text-alignment`: 'start' | 'end' = 'start'
- `type`: 'text' | 'email' | 'password' | 'tel' | 'url' = 'text'
- `valid-text`: string — The valid text for the text field.
- `value`: string — The value of the text field.
- `warning-text`: string — The warning text for the text field.

### `<ix-key-value>`
- `icon`: string — Optional key value icon
- `label`: string — Key value label
- `label-position`: 'top' | 'left' = 'top' — Optional key value label position - 'top' or 'left'
- `value`: string — Optional key value text value

### `<ix-key-value-list>`
- `striped`: boolean — Optional striped key value list style

### `<ix-kpi>`
- `orientation`: 'horizontal' | 'vertical' = 'horizontal'
- `state`: 'neutral' | 'warning' | 'alarm' = 'neutral'

### `<ix-layout-auto>`
- `layout`: { minWidth: string = [     { minWidth: '0', columns: 1 },     { minWidth: '48em', columns: 2 },   ] — Defines the layout of the form.

### `<ix-layout-grid>`
- `columns`: number = 12
- `gap`: '8' | '12' | '16' | '24' = '24' — Grid gap
- `no-margin`: boolean — The grid will not have any horizontal padding

### `<ix-link-button>`
- `disabled`: boolean — Disable the link button
- `url`: string — Url for the link button

### `<ix-menu>`
- `application-description`: string — Should only be set if you use ix-menu standalone
- `application-name`: string — Should only be set if you use ix-menu standalone
- `enable-toggle-theme`: boolean
- `expand`: boolean — Toggle the expand state of the menu
- `pinned`: boolean — Menu stays pinned to the left
- `show-about`: boolean — Is about tab visible
- `show-settings`: boolean — Is settings tab visible
- `start-expanded`: boolean

### `<ix-menu-category>`
- `disable-tooltip`: boolean — Disable the tooltip for this menu category.
- `icon`: string — Icon of the category
- `label`: string — Display name of the category
- `notifications`: number — Show notification count on the category

### `<ix-menu-item>`
- `active`: boolean — State to display active
- `bottom`: boolean
- `disable-tooltip`: boolean — Disable the tooltip for this menu item.
- `disabled`: boolean — Disable tab and remove event handlers
- `home`: boolean — Move the Tab to a top position.
- `href`: string
- `icon`: string
- `is-category`: boolean
- `label`: string — Label of the menu item. Will also be used as tooltip text
- `notifications`: number — Show notification count on tab

### `<ix-message-bar>`
- `persistent`: boolean
- `type`: 'alarm' | 'critical' | 'warning' | 'success' | 'info' | 'neutral' | 'primary' = 'info' — Specifies the type of the alert.

### `<ix-modal>`
- `centered`: boolean — Centered modal
- `close-on-backdrop-click`: boolean
- `disable-animation`: boolean — Should the modal animation be disabled
- `hide-backdrop`: boolean — Hide the backdrop behind the modal dialog
- `is-non-blocking`: boolean
- `size`: '360' | '480' | '600' | '720' | '840' | 'full-width' | 'full-screen' = '360' — Modal size

### `<ix-modal-content>`
- (no attributes; use slots/children)

### `<ix-modal-footer>`
- (no attributes; use slots/children)

### `<ix-modal-header>`
- `hide-close`: boolean — Hide the close button
- `icon`: string — Icon of the header
- `icon-color`: string — Icon color

### `<ix-number-input>`
- `allow-empty-value-change`: boolean
- `allowed-characters-pattern`: string — The allowed characters pattern for the input field
- `disabled`: boolean — Disables the input field
- `helper-text`: string — The helper text for the input field
- `info-text`: string — The info text for the input field
- `invalid-text`: string — The error text for the input field
- `label`: string — The label for the input field
- `max`: string | number — The maximum value for the input field
- `min`: string | number — The minimum value for the input field
- `name`: string — name of the input element
- `pattern`: string — The pattern for the input field
- `placeholder`: string — placeholder of the input element
- `readonly`: boolean — Indicates if the field is read-only
- `required`: boolean
- `show-stepper-buttons`: boolean — Indicates if the stepper buttons should be shown
- `show-text-as-tooltip`: boolean — Indicates if the text should be shown as a tooltip
- `step`: string | number = 1
- `text-alignment`: 'start' | 'end' = 'end'
- `valid-text`: string — The valid text for the input field
- `value`: number
- `warning-text`: string — The warning text for the input field

### `<ix-pagination>`
- `advanced`: boolean — Advanced mode
- `count`: number — Total number of pages
- `hide-item-count`: boolean — Hide item count in advanced mode
- `item-count`: number = 15 — Number of items shown at once. Can only be changed in advanced mode.
- `selected-page`: number — Zero based index of currently selected page

### `<ix-pane>`
- `borderless`: boolean
- `close-on-click-outside`: boolean — If true, the pane will close when clicking outside of it
- `composition`: 'top' | 'left' | 'bottom' | 'right' = 'top'
- `expanded`: boolean — State of the pane
- `heading`: string — Title of the side panel
- `hide-on-collapse`: boolean — Define if the pane should have a collapsed state
- `icon`: string — Name of the icon
- `ignore-layout-settings`: boolean
- `is-mobile`: boolean
- `no-padding`: boolean
- `size`: '240px' | '320px' | '360px' | '480px' | '600px' | '33%' | '50%' = '240px' — The maximum size of the sidebar, when it is expanded
- `variant`: 'floating' | 'inline' = 'inline'

### `<ix-pane-layout>`
- `borderless`: boolean — Set the default border state for all panes in the layout
- `layout`: 'full-vertical' | 'full-horizontal' = 'full-vertical'
- `variant`: 'floating' | 'inline' = 'inline' — Set the default variant for all panes in the layout

### `<ix-pill>`
- `align-left`: boolean — Align pill content left
- `background`: string — Custom color for pill. Only working for `variant='custom'`
- `icon`: string — Show icon
- `outline`: boolean — Show pill as outline
- `pill-color`: string — Custom font color for pill. Only working for `variant='custom'`
- `variant`: 'primary' | 'alarm' | 'critical' | 'warning' | 'info' | 'neutral' | 'success' | 'custom' = 'primary' — Pill variant

### `<ix-progress-indicator>`
- `helper-text`: string — The helper text for the progress indicator.
- `label`: string — The label for the progress indicator.
- `max`: number = 100 — The maximum value of the progress indicator.
- `min`: number — The minimum value of the progress indicator.
- `show-text-as-tooltip`: boolean — Show the helper text as a tooltip
- `size`: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md' — The size of the progress indicator.
- `status`: 'default' | 'success' | 'error' | 'info' | 'warning' | 'paused' = 'default'
- `text-alignment`: 'left' | 'center' | 'right' = 'left'
- `type`: 'linear' | 'circular' = 'linear' — The type of progress indicator to use.
- `value`: number — The value of the progress indicator.

### `<ix-push-card>`
- `expanded`: boolean — Expand the card
- `heading`: string — Card heading
- `icon`: string — Card icon
- `notification`: string — Card KPI value
- `passive`: boolean
- `subheading`: string — Card subheading
- `variant`: 'alarm' | 'critical' | 'warning' | 'info' | 'neutral' | 'success' | 'primary' | 'outline' | 'filled' = 'outline' — Card variant

### `<ix-radio>`
- `checked`: boolean — Checked state of the radio component
- `disabled`: boolean — Disabled state of the radio component
- `label`: string — Label for the radio component
- `name`: string — Name of the radio component
- `required`: boolean
- `value`: string — Value of the radio component

### `<ix-radio-group>`
- `direction`: 'column' | 'row' = 'column' — Alignment of the radio buttons in the group
- `helper-text`: string — Show text below the field component
- `info-text`: string — Info text for the field component
- `invalid-text`: string — Error text for the field component
- `label`: string — Label for the field component
- `required`: boolean — Required state of the checkbox component
- `show-text-as-tooltip`: boolean — Show helper, info, warning, error and valid text as tooltip
- `valid-text`: string — Valid text for the field component
- `value`: string — Value of the radiobutton group component
- `warning-text`: string — Warning text for the field component

### `<ix-row>`
- (no attributes; use slots/children)

### `<ix-select>`
- `allow-clear`: boolean — Show clear button
- `collapse-multiple-selection`: boolean — Show "all" chip when all items are selected in multiple mode
- `disabled`: boolean — If true the select will be in disabled state
- `dropdown-max-width`: string
- `dropdown-width`: string
- `editable`: boolean — Select is extendable
- `helper-text`: string — Helper text for the select component
- `hide-list-header`: boolean — Hide list header
- `info-text`: string — Info text for the select component
- `invalid-text`: string — Error text for the select component
- `label`: string — Label for the select component
- `mode`: 'single' | 'multiple' = 'single' — Selection mode
- `name`: string
- `readonly`: boolean — If true the select will be in readonly mode
- `required`: boolean
- `show-text-as-tooltip`: boolean — Show helper, error, info, warning text as tooltip
- `valid-text`: string — Valid text for the select component
- `warning-text`: string — Warning text for the select component

### `<ix-select-item>`
- `disable-aria-select-handling`: boolean
- `disabled`: boolean
- `hover`: boolean
- `ix-focus-visible`: boolean
- `label`: string — Displayed name of the item
- `selected`: boolean — Flag indicating whether the item is selected
- `value`: string

### `<ix-slider>`
- `disabled`: boolean — Show control as disabled
- `helper-text`: string — Show text below the field component
- `info-text`: string — Info text for the field component
- `invalid-text`: string — Error text for the field component
- `label`: string — Label for the field component
- `marker`: SliderMarker
- `max`: number = 100 — Maximum slider value
- `min`: number — Minimum slider value
- `show-text-as-tooltip`: boolean — Show helper, info, warning, error and valid text as tooltip
- `step`: number = 1
- `trace`: boolean — Show a trace line
- `trace-reference`: number — Define the start point of the trace line
- `valid-text`: string — Valid text for the field component
- `value`: number — Current value of the slider
- `warning-text`: string — Warning text for the field component

### `<ix-spinner>`
- `hide-track`: boolean
- `size`: 'xx-small' | 'x-small' | 'small' | 'medium' | 'large' = 'medium' — Size of spinner
- `variant`: 'primary' | 'secondary' = 'secondary' — Variant of spinner

### `<ix-split-button>`
- `close-behavior`: CloseBehavior = 'both'
- `disable-button`: boolean
- `disable-dropdown-button`: boolean
- `disabled`: boolean — Disabled
- `icon`: string — Button icon
- `label`: string — Button label
- `split-icon`: string — Icon of the button on the right
- `variant`: 'primary' | 'secondary' | 'tertiary' | 'subtle-primary' | 'subtle-secondary' | 'subtle-tertiary' | 'danger-primary' | 'danger-secondary' | 'danger-tertiary' = 'primary' — Color variant of button

### `<ix-tab-item>`
- `closable`: boolean — If the tab can be closed
- `counter`: number — Set counter value
- `disabled`: boolean — Set disabled tab
- `icon`: string — Set icon of the tab
- `icon-only`: boolean
- `label`: string — Tab label
- `layout`: 'auto' | 'stretched' = 'auto'
- `placement`: 'bottom' | 'top' = 'bottom'
- `rounded`: boolean
- `selected`: boolean — Set selected tab
- `small`: boolean
- `tab-key`: string — Key of the tab, used for identifying the tab in events

### `<ix-tabs>`
- `active-tab-key`: string — Active tab key.
- `keyboard-navigation`: 'automatic' | 'manual' = 'automatic'
- `layout`: 'auto' | 'stretched' = 'auto' — Set layout width style
- `placement`: 'bottom' | 'top' = 'bottom' — Set placement style
- `rounded`: boolean — Set rounded tabs
- `small`: boolean — Set tab items to small size

### `<ix-textarea>`
- `disabled`: boolean — Determines if the textarea field is disabled.
- `helper-text`: string — The helper text for the textarea field.
- `info-text`: string — The info text for the textarea field.
- `invalid-text`: string — The error text for the textarea field.
- `label`: string — The label for the textarea field.
- `max-length`: number — The maximum length of the textarea field.
- `min-length`: number — The minimum length of the textarea field.
- `name`: string — The name of the textarea field.
- `placeholder`: string — The placeholder text for the textarea field.
- `readonly`: boolean — Determines if the textarea field is readonly.
- `required`: boolean — Determines if the textarea field is required.
- `resize-behavior`: 'both' | 'horizontal' | 'vertical' | 'none' = 'both'
- `show-text-as-tooltip`: boolean — Determines if the text should be displayed as a tooltip.
- `textarea-cols`: number
- `textarea-height`: string
- `textarea-rows`: number
- `textarea-width`: string
- `valid-text`: string — The valid text for the textarea field.
- `value`: string — The value of the textarea field.
- `warning-text`: string — The warning text for the textarea field.

### `<ix-tile>`
- `size`: 'small' | 'medium' | 'big' = 'medium' — Size of the tile - one of 'small', 'medium' or 'large'

### `<ix-time-input>`
- `disabled`: boolean — Disabled attribute.
- `format`: string = 'TT'
- `helper-text`: string — Helper text below the input field.
- `hide-header`: boolean — Hides the header of the picker.
- `hour-interval`: number = 1 — Interval for hour selection.
- `info-text`: string — Info text below the input field.
- `invalid-text`: string — Error text below the input field.
- `label`: string — Label of the input field.
- `max-time`: string
- `millisecond-interval`: number = 100 — Interval for millisecond selection.
- `min-time`: string
- `minute-interval`: number = 1 — Interval for minute selection.
- `name`: string — Name of the input element.
- `placeholder`: string — Placeholder of the input element.
- `readonly`: boolean — Readonly attribute.
- `required`: boolean — Required attribute.
- `second-interval`: number = 1 — Interval for second selection.
- `show-text-as-tooltip`: boolean — Show text as tooltip.
- `text-alignment`: 'start' | 'end' = 'start'
- `valid-text`: string — Valid text below the input field.
- `value`: string — Value of the input element.
- `warning-text`: string — Warning text below the input field.

### `<ix-toast>`
- `auto-close-delay`: number = 5000 — Autoclose title after delay
- `hide-icon`: boolean — Allows to hide the icon in the toast.
- `icon`: string — Icon of toast
- `icon-color`: string — Icon color of toast
- `prevent-auto-close`: boolean — Autoclose behavior
- `toast-title`: string — Toast title
- `type`: 'info' | 'success' | 'error' | 'warning' = 'info' — Toast type

### `<ix-toggle>`
- `checked`: boolean — Whether the slide-toggle element is checked or not.
- `disabled`: boolean — Whether the slide-toggle element is disabled or not.
- `hide-text`: boolean — Hide `on` and `off` text
- `indeterminate`: boolean — If true the control is in indeterminate state
- `name`: string — Name of the checkbox component
- `required`: boolean
- `text-indeterminate`: string = 'Mixed' — Text for indeterminate state
- `text-off`: string = 'Off' — Text for off state
- `text-on`: string = 'On' — Text for on state
- `value`: string = 'on' — Value of the checkbox component

### `<ix-toggle-button>`
- `disabled`: boolean — Disable the button
- `icon`: string — Icon name
- `icon-right`: string — Icon name for the right side of the button
- `loading`: boolean — Loading button
- `pressed`: boolean — Show button as pressed
- `variant`: ToggleButtonVariant = 'subtle-primary' — Button variant.

### `<ix-tooltip>`
- `animation-frame`: boolean
- `hide-delay`: number = 50
- `interactive`: boolean — Define if the user can access the tooltip via mouse.
- `placement`: 'top' | 'right' | 'bottom' | 'left' = 'top'
- `show-delay`: number
- `title-content`: string — Title of the tooltip

### `<ix-tree>`
- `context`: TreeContext = {} — Selection and collapsed state management
- `model`: TreeModel<any> = {} — Tree model
- `root`: string = 'root' — Initial root element will not be rendered
- `toggle-on-item-click`: boolean — Enable to toggle items by click on the item

### `<ix-typography>`
- `bold`: boolean — Display text bold
- `format`: 'label' | 'label-xs' | 'label-sm' | 'label-lg' | 'body' | 'body-xs' | 'body-sm' | 'body-lg' | 'display' | 'display-xs' | 'display-sm' | 'display-lg' | 'display-xl' | 'display-xxl' | 'h6' | 'h5' | 'h4' | 'h3' | 'h2' | 'h1' | 'code' | 'code-sm' | 'code-lg' — Text format
- `text-color`: 'alarm' | 'alarm-contrast' | 'contrast' | 'critical-contrast' | 'info-contrast' | 'inv-contrast' | 'inv-soft' | 'inv-std' | 'inv-weak' | 'neutral-contrast' | 'primary-contrast' | 'soft' | 'std' | 'success-contrast' | 'warning-contrast' | 'weak' — Text color based on theme variables
- `text-decoration`: 'none' | 'underline' | 'line-through' = 'none' — Text decoration

### `<ix-upload>`
- `accept`: string
- `directory-upload`: boolean
- `disabled`: boolean — Disable all input events
- `loading-text`: string — Will be used by state = UploadFileState.LOADING
- `multiline`: boolean — Whether the text should wrap to more than one line
- `multiple`: boolean — If multiple is true the user can drop or select multiple files
- `select-file-text`: string — Will be used by state = UploadFileState.SELECT_FILE
- `state`: UploadFileState = UploadFileState.SELECT_FILE
- `upload-failed-text`: string = 'Upload failed. Please try again.' — Will be used by state = UploadFileState.UPLOAD_FAILED
- `upload-success-text`: string = 'Upload successful' — Will be used by state = UploadFileState.UPLOAD_SUCCESSED

### `<ix-workflow-step>`
- `clickable`: boolean — Activate navigation click
- `disabled`: boolean — Set disabled
- `position`: 'first' | 'last' | 'single' | 'undefined' = 'undefined' — Activate navigation click
- `selected`: boolean — Set selected
- `status`: 'open' | 'success' | 'done' | 'warning' | 'error' = 'open' — Set status
- `vertical`: boolean — Select orientation

### `<ix-workflow-steps>`
- `clickable`: boolean — Activate navigation click
- `selected-index`: number — Activate navigation click
- `vertical`: boolean — Select orientation
