## Storage Layout

This is documentation to better understand and document the current layout of the storage system used in the extension.

### Storage

|         Keys         |   Type  |                              Value                               |
| :------------------: | :-----: | :--------------------------------------------------------------: |
|       `groups`       |  Array  |                   An array of `Group` objects                    |
|  `page:<url here>`   |  Object |                     An `Assignment` object.                      |
| `reverseTabDisplay`  | Boolean |            Whether to reverse tab display in groups.             |
| `openSidebarOnClick` | Boolean | Whether to open the sideback when the toolbar button is clicked. |


### Objects

A list of objects referred.

#### Group

Represents a tab group obviously.

|  Keys  |   Type  |            Value            |
| :----: | :-----: | :-------------------------: |
|  name  |  String |        The group name       |
|  uuid  |  String |    The group's unique ID    |
|  open  | Boolean |  Whether the group is open  |
| active | Boolean | Whether the group is active |


#### Assignment

Represents an automatic assignment. Basically a URL that is assigned to automatically open in a group.

|   Keys   |   Type  |                                Value                                 |
| :------: | :-----: | :------------------------------------------------------------------: |
|  group   |  String |         The group's unique ID that refers to this assignment         |
| neverAsk |   Int   | Whether to ask to move the tab to assigned group if the current one is different. 1 — do not ask and move, 2 — do not ask and do not move |
