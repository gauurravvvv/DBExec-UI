import { NgModule } from '@angular/core';

import { AccordionModule } from 'primeng/accordion';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { BadgeModule } from 'primeng/badge';
import { BlockUIModule } from 'primeng/blockui';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { CardModule } from 'primeng/card';
import { CarouselModule } from 'primeng/carousel';
import { ChartModule } from 'primeng/chart';
import { CheckboxModule } from 'primeng/checkbox';
import { ChipModule } from 'primeng/chip';
import { ChipsModule } from 'primeng/chips';
import { ColorPickerModule } from 'primeng/colorpicker';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ContextMenuModule } from 'primeng/contextmenu';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { DropdownModule } from 'primeng/dropdown';
import { FieldsetModule } from 'primeng/fieldset';
import { FileUploadModule } from 'primeng/fileupload';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { KeyFilterModule } from 'primeng/keyfilter';
import { ListboxModule } from 'primeng/listbox';
import { MegaMenuModule } from 'primeng/megamenu';
import { MenuModule } from 'primeng/menu';
import { MenubarModule } from 'primeng/menubar';
import { MessageModule } from 'primeng/message';
import { MessagesModule } from 'primeng/messages';
import { MultiSelectModule } from 'primeng/multiselect';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { PaginatorModule } from 'primeng/paginator';
import { PanelModule } from 'primeng/panel';
import { PanelMenuModule } from 'primeng/panelmenu';
import { PasswordModule } from 'primeng/password';
import { PickListModule } from 'primeng/picklist';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { RadioButtonModule } from 'primeng/radiobutton';
import { RippleModule } from 'primeng/ripple';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SidebarModule } from 'primeng/sidebar';
import { SkeletonModule } from 'primeng/skeleton';
import { SliderModule } from 'primeng/slider';
import { SplitButtonModule } from 'primeng/splitbutton';
import { SplitterModule } from 'primeng/splitter';
import { StepsModule } from 'primeng/steps';
import { TableModule } from 'primeng/table';
import { TabMenuModule } from 'primeng/tabmenu';
import { TabViewModule } from 'primeng/tabview';
import { TagModule } from 'primeng/tag';
import { TieredMenuModule } from 'primeng/tieredmenu';
import { ToastModule } from 'primeng/toast';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { TooltipModule } from 'primeng/tooltip';
import { TreeModule } from 'primeng/tree';
import { TreeSelectModule } from 'primeng/treeselect';

/**
 * TODO [Performance]: Split into per-feature PrimeNG imports when migrating to
 * standalone components. Currently all 62 modules are re-exported here; Angular
 * tree-shakes unused ones in production builds, but lazy chunk sizes would
 * benefit from importing only what each feature module actually uses.
 */
@NgModule({
  imports: [
    BreadcrumbModule,
    ButtonModule,
    CalendarModule,
    CardModule,
    ChartModule,
    CheckboxModule,
    DialogModule,
    DropdownModule,
    FileUploadModule,
    InputTextModule,
    MegaMenuModule,
    MessageModule,
    MessagesModule,
    PaginatorModule,
    PanelMenuModule,
    RippleModule,
    ScrollPanelModule,
    SidebarModule,
    TableModule,
    ToastModule,
    SplitterModule,
    BlockUIModule,
    InputTextareaModule,
    FieldsetModule,
    PanelModule,
    MenuModule,
    TabMenuModule,
    MenubarModule,
    TabViewModule,
    TagModule,
    ContextMenuModule,
    MultiSelectModule,
    ProgressBarModule,
    SliderModule,
    ConfirmDialogModule,
    AutoCompleteModule,
    OverlayPanelModule,
    ChipModule,
    PasswordModule,
    InputSwitchModule,
    TieredMenuModule,
    BadgeModule,
    AccordionModule,
    ToggleButtonModule,
    ProgressSpinnerModule,
    RadioButtonModule,
    StepsModule,
    InputNumberModule,
    ChipsModule,
    DividerModule,
    PickListModule,
    ListboxModule,
    SkeletonModule,
    TooltipModule,
    SelectButtonModule,
    KeyFilterModule,
    TreeModule,
    TreeSelectModule,
    CarouselModule,
    SplitButtonModule,
    ColorPickerModule,
  ],
  exports: [
    BreadcrumbModule,
    ButtonModule,
    CalendarModule,
    CardModule,
    ChartModule,
    CheckboxModule,
    DialogModule,
    DropdownModule,
    FileUploadModule,
    InputTextModule,
    MegaMenuModule,
    MessageModule,
    MessagesModule,
    PaginatorModule,
    PanelMenuModule,
    RippleModule,
    ScrollPanelModule,
    SidebarModule,
    TableModule,
    ToastModule,
    BlockUIModule,
    InputTextareaModule,
    FieldsetModule,
    PanelModule,
    MenuModule,
    TabMenuModule,
    MenubarModule,
    TabViewModule,
    TagModule,
    ContextMenuModule,
    MultiSelectModule,
    ProgressBarModule,
    SliderModule,
    ConfirmDialogModule,
    AutoCompleteModule,
    OverlayPanelModule,
    ChipModule,
    PasswordModule,
    InputSwitchModule,
    TieredMenuModule,
    BadgeModule,
    AccordionModule,
    ToggleButtonModule,
    ProgressSpinnerModule,
    RadioButtonModule,
    StepsModule,
    InputNumberModule,
    ChipsModule,
    DividerModule,
    PickListModule,
    ListboxModule,
    SkeletonModule,
    TooltipModule,
    SelectButtonModule,
    KeyFilterModule,
    SplitterModule,
    TreeModule,
    TreeSelectModule,
    CarouselModule,
    SplitButtonModule,
    ColorPickerModule,
  ],
  providers: [ConfirmationService, MessageService],
})
export class AppPrimeNGModule {}
