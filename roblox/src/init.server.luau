local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")

local BRIDGE_URL = "wss://scaling-halibut-x59x9q5r5ggx39vvp-8080.app.github.dev"
local HTTP_URL = string.gsub(string.gsub(BRIDGE_URL, "^wss://", "https://"), "^ws://", "http://")

print("[ExplorerRS] Roblox Studio Plugin Initialized. Bridge HTTP endpoint:", HTTP_URL)

-- Recursive helper to locate Roblox Instances by their DebugId
local function findInstanceByDebugId(root, debugId)
    if root:GetDebugId() == debugId then
        return root
    end
    for _, descendant in ipairs(root:GetDescendants()) do
        if descendant:GetDebugId() == debugId then
            return descendant
        end
    end
    return nil
end

-- Recursive function to generate the Instance Tree
local function getHierarchy(instance)
    local node = {
        id = instance:GetDebugId(),
        name = instance.Name,
        className = instance.ClassName,
        properties = {
            Name = instance.Name,
            ClassName = instance.ClassName
        },
        children = {}
    }
    
    for _, child in ipairs(instance:GetChildren()) do
        if not child:IsA("CoreScript") then
            table.insert(node.children, getHierarchy(child))
        end
    end
    
    return node
end

-- Pending incremental changes queue
local pendingChanges = {}

local function queueChange(change)
    table.insert(pendingChanges, change)
end

-- Connect and disconnect property/parent listeners for real-time changes
local connectedSignals = {}

local function trackInstance(instance)
    if connectedSignals[instance] then return end

    local conn = instance.Changed:Connect(function(property)
        if property == "Name" then
            queueChange({
                type = "rename",
                instanceId = instance:GetDebugId(),
                newName = instance.Name
            })
        elseif property == "Parent" then
            if instance.Parent then
                queueChange({
                    type = "move",
                    instanceId = instance:GetDebugId(),
                    newParentId = instance.Parent:GetDebugId()
                })
            end
        end
    end)
    connectedSignals[instance] = conn
end

local function untrackInstance(instance)
    local conn = connectedSignals[instance]
    if conn then
        conn:Disconnect()
        connectedSignals[instance] = nil
    end
end

-- Setup workspace hierarchy change listeners
local function setupListeners()
    game.Workspace.DescendantAdded:Connect(function(descendant)
        if descendant:IsA("CoreScript") then return end
        trackInstance(descendant)
        queueChange({
            type = "create",
            parentId = descendant.Parent:GetDebugId(),
            instanceId = descendant:GetDebugId(),
            className = descendant.ClassName,
            name = descendant.Name
        })
    end)

    game.Workspace.DescendantRemoving:Connect(function(descendant)
        if descendant:IsA("CoreScript") then return end
        untrackInstance(descendant)
        queueChange({
            type = "delete",
            instanceId = descendant:GetDebugId()
        })
    end)

    -- Track all existing descendants in Workspace
    for _, descendant in ipairs(game.Workspace:GetDescendants()) do
        if not descendant:IsA("CoreScript") then
            trackInstance(descendant)
        end
    end
    trackInstance(game.Workspace)
end

setupListeners()
print("[ExplorerRS] Workspace change listeners attached successfully.")

-- Polling loop task to sync with bridge
local hasSentInitialHierarchy = false

task.spawn(function()
    while true do
        task.wait(0.5)

        local payload = nil
        local changesToSend = nil

        if not hasSentInitialHierarchy then
            -- Generate and send initial full hierarchy snapshot
            local success, hierarchyData = pcall(function()
                return getHierarchy(game.Workspace)
            end)

            if success then
                payload = {
                    type = "hierarchy.full",
                    protocolVersion = 1,
                    data = {
                        Workspace = hierarchyData
                    }
                }
            else
                warn("[ExplorerRS] Failed to generate initial hierarchy snapshot.")
            end
        elseif #pendingChanges > 0 then
            -- Copy and send pending changes
            changesToSend = pendingChanges
            pendingChanges = {}

            payload = {
                type = "changes.apply",
                protocolVersion = 1,
                payload = {
                    changeSet = {
                        id = "change-" .. tostring(os.time()) .. "-" .. tostring(math.random(1000, 9999)),
                        changes = changesToSend
                    }
                }
            }
        else
            -- Standard heartbeat poll to receive bridge commands
            payload = {
                type = "poll",
                protocolVersion = 1
            }
        end

        if payload then
            local successJson, jsonStr = pcall(function()
                return HttpService:JSONEncode(payload)
            end)

            if successJson then
                local successPost, response = pcall(function()
                    return HttpService:PostAsync(HTTP_URL .. "/api/sync", jsonStr, Enum.HttpContentType.ApplicationJson)
                end)

                if successPost then
                    if payload.type == "hierarchy.full" then
                        hasSentInitialHierarchy = true
                        print("[ExplorerRS] Successfully synchronized full hierarchy to Bridge.")
                    elseif payload.type == "changes.apply" then
                        print("[ExplorerRS] Successfully synchronized " .. tostring(#changesToSend) .. " incremental changes.")
                    end

                    -- Process updates returned from bridge
                    local successDecode, decoded = pcall(function()
                        return HttpService:JSONDecode(response)
                    end)

                    if successDecode and decoded then
                        -- 1. Sync Selection from Bridge
                        if decoded.selection and decoded.selection ~= "" then
                            local selectedId = decoded.selection
                            local target = findInstanceByDebugId(game.Workspace, selectedId)
                            if target then
                                pcall(function()
                                    Selection:Set({target})
                                    print("[ExplorerRS] Synced selection from bridge:", target.Name)
                                end)
                            end
                        end

                        -- 2. Sync Property Updates from Bridge
                        if decoded.updates and #decoded.updates > 0 then
                            for _, update in ipairs(decoded.updates) do
                                local target = findInstanceByDebugId(game.Workspace, update.id)
                                if target then
                                    local property = update.property
                                    local value = update.value

                                    local successProp, err = pcall(function()
                                        target[property] = value
                                    end)
                                    if successProp then
                                        print("[ExplorerRS] Property '" .. property .. "' updated successfully to '" .. tostring(value) .. "' on " .. target.Name)
                                    else
                                        warn("[ExplorerRS] Failed to update property '" .. property .. "' on " .. target.Name .. ": " .. tostring(err))
                                    end
                                end
                            end
                        end

                        -- 3. Process Actions returned from Bridge (create, delete, restore_snapshot)
                        if decoded.actions and #decoded.actions > 0 then
                            for _, action in ipairs(decoded.actions) do
                                if action.type == "create" then
                                    local parentId = action.parentId
                                    local className = action.className
                                    local name = action.name

                                    local parent = findInstanceByDebugId(game.Workspace, parentId)
                                    if parent then
                                        local successCreate, newInst = pcall(function()
                                            return Instance.new(className)
                                        end)
                                        if successCreate and newInst then
                                            newInst.Name = name
                                            newInst.Parent = parent
                                            print("[ExplorerRS] Created instance of ClassName '" .. className .. "' named '" .. name .. "' under parent '" .. parent.Name .. "'")
                                        else
                                            warn("[ExplorerRS] Failed to create instance of ClassName '" .. className .. "'")
                                        end
                                    else
                                        warn("[ExplorerRS] 'create' action failed: parent instance not found for parentId '" .. tostring(parentId) .. "'")
                                    end
                                elseif action.type == "delete" then
                                    local instanceId = action.instanceId
                                    local target = findInstanceByDebugId(game.Workspace, instanceId)
                                    if target then
                                        local successDestroy, err = pcall(function()
                                            target:Destroy()
                                        end)
                                        if successDestroy then
                                            print("[ExplorerRS] Deleted target instance '" .. target.Name .. "' with DebugId '" .. tostring(instanceId) .. "'")
                                        else
                                            warn("[ExplorerRS] Failed to delete target instance '" .. target.Name .. "': " .. tostring(err))
                                        end
                                    else
                                        warn("[ExplorerRS] 'delete' action failed: target instance not found for instanceId '" .. tostring(instanceId) .. "'")
                                    end
                                elseif action.type == "restore_snapshot" then
                                    print("[ExplorerRS] Restoring snapshot from bridge action...")

                                    -- Clear existing non-CoreScript, non-Camera, non-Terrain instances
                                    for _, child in ipairs(game.Workspace:GetChildren()) do
                                        if not child:IsA("CoreScript") and not child:IsA("Camera") and child.Name ~= "Terrain" then
                                            pcall(function()
                                                child:Destroy()
                                            end)
                                        end
                                    end

                                    -- Recursive function to rebuild from snapshot
                                    local function rebuildHierarchy(parentInstance, node)
                                        if not node then return end
                                        local instance = nil
                                        if node.className == "Workspace" then
                                            instance = game.Workspace
                                        else
                                            local successCreate, newInst = pcall(function()
                                                return Instance.new(node.className)
                                            end)
                                            if successCreate and newInst then
                                                instance = newInst
                                                instance.Name = node.name
                                                instance.Parent = parentInstance
                                            else
                                                warn("[ExplorerRS] Snapshot rebuild failed to create ClassName '" .. tostring(node.className) .. "'")
                                                return
                                            end
                                        end

                                        if node.children then
                                            for _, childNode in ipairs(node.children) do
                                                rebuildHierarchy(instance, childNode)
                                            end
                                        end
                                    end

                                    local successRebuild, err = pcall(function()
                                        rebuildHierarchy(nil, action.snapshot)
                                    end)
                                    if successRebuild then
                                        print("[ExplorerRS] Successfully restored snapshot and rebuilt Workspace hierarchy.")
                                    else
                                        warn("[ExplorerRS] Error restoring snapshot: " .. tostring(err))
                        -- 3. Sync Instance Actions (create/delete) from Bridge
                        if decoded.actions and #decoded.actions > 0 then
                            for _, action in ipairs(decoded.actions) do
                                if action.type == "create" then
                                    local parent = findInstanceByDebugId(game.Workspace, action.parentId)
                                    if not parent then
                                        warn("[ExplorerRS] Cannot create instance: parent not found (DebugId: " .. tostring(action.parentId) .. ")")
                                    else
                                        local successCreate, createErr = pcall(function()
                                            local instance = Instance.new(action.className)
                                            instance.Name = action.name
                                            instance.Parent = parent
                                        end)
                                        if successCreate then
                                            print("[ExplorerRS] Created instance '" .. tostring(action.name) .. "' (" .. tostring(action.className) .. ") under " .. parent.Name)
                                        else
                                            warn("[ExplorerRS] Failed to create instance '" .. tostring(action.name) .. "': " .. tostring(createErr))
                                        end
                                    end
                                elseif action.type == "delete" then
                                    local target = findInstanceByDebugId(game.Workspace, action.instanceId)
                                    if not target then
                                        warn("[ExplorerRS] Cannot delete instance: not found (DebugId: " .. tostring(action.instanceId) .. ")")
                                    else
                                        local successDelete, deleteErr = pcall(function()
                                            target:Destroy()
                                        end)
                                        if successDelete then
                                            print("[ExplorerRS] Deleted instance '" .. target.Name .. "' (" .. tostring(action.instanceId) .. ")")
                                        else
                                            warn("[ExplorerRS] Failed to delete instance '" .. target.Name .. "': " .. tostring(deleteErr))
                                        end
                                    end
                                end
                            end
                        end
                    end
                else
                    -- Re-queue changes if network sync fails
                    if changesToSend then
                        for i = #changesToSend, 1, -1 do
                            table.insert(pendingChanges, 1, changesToSend[i])
                        end
                    end
                    task.wait(2)
                end
            end
        end
    end
end)
