import Controller, { inject as controller } from "@ember/controller";
import discourseComputed, { observes } from "discourse-common/utils/decorators";
import { action } from "@ember/object";
import { ajax } from "discourse/lib/ajax";
import discourseDebounce from "discourse-common/lib/debounce";
import { gt } from "@ember/object/computed";
import { popupAjaxError } from "discourse/lib/ajax-error";

export default Controller.extend({
  application: controller(),

  queryParams: ["order", "asc", "filter"],

  order: "",
  asc: true,
  filter: null,
  filterInput: null,

  loading: false,
  isBulk: false,
  showActions: false,

  bulkSelection: null,

  @observes("filterInput")
  _setFilter() {
    discourseDebounce(
      this,
      function () {
        this.set("filter", this.filterInput);
      },
      500
    );
  },

  @observes("order", "asc", "filter")
  _filtersChanged() {
    this.findMembers(true);
  },

  findMembers(refresh) {
    if (this.loading || !this.model) {
      return;
    }

    if (!refresh && this.model.members.length >= this.model.user_count) {
      this.set("application.showFooter", true);
      return;
    }

    this.set("loading", true);
    this.model.findMembers(this.memberParams, refresh).finally(() => {
      this.setProperties({
        "application.showFooter":
          this.model.members.length >= this.model.user_count,
        loading: false,
      });
    });
  },

  @discourseComputed("order", "asc", "filter")
  memberParams(order, asc, filter) {
    return { order, asc, filter };
  },

  hasMembers: gt("model.members.length", 0),

  @discourseComputed("model")
  canManageGroup(model) {
    return this.currentUser && this.currentUser.canManageGroup(model);
  },

  @discourseComputed
  filterPlaceholder() {
    if (this.currentUser && this.currentUser.admin) {
      return "groups.members.filter_placeholder_admin";
    } else {
      return "groups.members.filter_placeholder";
    }
  },

  @action
  loadMore() {
    this.findMembers();
  },

  @action
  toggleActions() {
    this.toggleProperty("showActions");
  },

  @action
  actOnGroup(member, actionId) {
    switch (actionId) {
      case "removeMember":
        this.removeMember(member);
        break;
      case "makeOwner":
        this.makeOwner(member.username);
        break;
      case "removeOwner":
        this.removeOwner(member);
        break;
      case "makePrimary":
        member
          .setPrimaryGroup(this.model.id)
          .then(() => member.set("primary", true));
        break;
      case "removePrimary":
        member.setPrimaryGroup(null).then(() => member.set("primary", false));
        break;
    }
  },

  @action
  actOnSelection(selection, actionId) {
    const userIds = (selection || []).map((member) => member.id);

    switch (actionId) {
      case "removeMembers":
        return ajax(`/groups/${this.model.id}/members.json`, {
          type: "DELETE",
          data: { user_ids: userIds },
        }).then(() => this.model.findMembers(this.memberParams, true));

      case "makeOwners":
        return ajax(`/admin/groups/${this.model.id}/owners.json`, {
          type: "PUT",
          data: { user_ids: userIds },
        }).then(() => selection.forEach((s) => s.set("owner", true)));

      case "removeOwners":
        return ajax(`/admin/groups/${this.model.id}/owners.json`, {
          type: "DELETE",
          data: { user_ids: userIds },
        }).then(() => selection.forEach((s) => s.set("owner", false)));

      case "makeAllPrimary":
        return ajax(`/admin/groups/${this.model.id}/primary.json`, {
          type: "PUT",
          data: { user_ids: userIds },
        }).then(() => selection.forEach((s) => s.set("primary", true)));

      case "removeAllPrimary":
        return ajax(`/admin/groups/${this.model.id}/primary.json`, {
          type: "DELETE",
          data: { user_ids: userIds },
        }).then(() => selection.forEach((s) => s.set("primary", false)));
    }
  },

  @action
  removeMember(user) {
    this.model.removeMember(user, this.memberParams);
  },

  @action
  makeOwner(username) {
    this.model.addOwners(username);
  },

  @action
  removeOwner(user) {
    this.model.removeOwner(user);
  },

  @action
  addMembers() {
    if (this.usernames && this.usernames.length > 0) {
      this.model
        .addMembers(this.usernames)
        .then(() => this.set("usernames", []))
        .catch(popupAjaxError);
    }
  },

  @action
  toggleBulkSelect() {
    this.setProperties({
      isBulk: !this.isBulk,
      bulkSelection: null,
    });
  },

  @action
  selectMember(member, e) {
    this.set("bulkSelection", this.bulkSelection || []);

    if (e.target.checked) {
      this.bulkSelection.pushObject(member);
    } else {
      this.bulkSelection.removeObject(member);
    }
  },
});
