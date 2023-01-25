from flask_wtf import FlaskForm
from wtforms import StringField, SubmitField, validators

class DescriptionForm(FlaskForm):
    description = StringField('Room Description', [validators.DataRequired('Description is required!'), validators.Length(min=1, max=50, message='Description is up to 50 characters...')])
    submit = SubmitField('Create room')

class ChatForm(FlaskForm):
    message = StringField('Message', [validators.DataRequired(), validators.Length(min=1, max=200)])
    submit = SubmitField('Send')