## Storage Layout

This is documentation to better understand and document the current layout of the storage system used in the extension.

### Storage

|        Keys       |  Type  |            Value            |
| :---------------: | :----: | :-------------------------: |
|      `groups`     | Array  | An array of `Group` objects |
| `page:<url here>` | Object |   An `Assignment` object.   |


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
| neverAsk | Boolean | Whether to ask to redirect if the group differs from the assignment. |
