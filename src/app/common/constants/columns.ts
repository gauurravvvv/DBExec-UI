export const COLUMNS = [
        {
            "label": "Case Level",
            "data": "Case Level Folder",
            "expandedIcon": "pi pi-folder-open",
            "collapsedIcon": "pi pi-folder",
            "children": [{
                    "label": "Case Number",
                    "data": "Work Folder",
                    "expandedIcon": "pi pi-folder-open",
                    "collapsedIcon": "pi pi-file",
                },
                {
                    "label": "Initial Receipt Date",
                    "data": "receipt date",
                    "collapsedIcon": "pi pi-file",
                },
                {
                    "label": "Patient Info",
                    "data": "Patient Info Folder",
                    "expandedIcon": "pi pi-folder-open",
                    "collapsedIcon": "pi pi-folder",
                    "children": [{"label": "Patient First Name", "icon": "pi pi-file", "data": "first name"},
                                {"label": "Patient Last Name", "icon": "pi pi-file", "data": "last name"}]
                },
            ]
        },
        {
            "label": "Event Level",
            "data": "Event Level Folder",
            "expandedIcon": "pi pi-folder-open",
            "collapsedIcon": "pi pi-folder",
            "children": [
                {"label": "Preferred Term", "icon": "pi pi-file", "data": "term"},
                {"label": "SOC", "icon": "pi pi-file", "data": "soc"}
            ]
        },
        {
            "label": "Product Level",
            "data": "Product Level Folder",
            "expandedIcon": "pi pi-folder-open",
            "collapsedIcon": "pi pi-folder",
            "children": [{
                    "label": "Product Name",
                    "data": "product name",
                    "icon": "pi pi-file"
                },
                {
                    "label": "Family Name",
                    "data": "family name",
                    "icon": "pi pi-file"
                }]
        },
        {
            "label": "Product - Event Level",
            "data": "Product - Event Level Folder",
            "expandedIcon": "pi pi-folder-open",
            "collapsedIcon": "pi pi-folder",
            "children": [{
                    "label": "Causality",
                    "data": "causality",
                    "icon": "pi pi-file"
                },
                {
                    "label": "Listedness",
                    "data": "listedness",
                    "icon": "pi pi-file"
                }]
        },
    ];
