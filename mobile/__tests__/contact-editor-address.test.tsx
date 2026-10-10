import { fireEvent, screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import { ContactEditor } from '@/components/ContactEditor'

// ---------------------------------------------------------------------------
// Une adresse, une personne (#655, 4 bis)
//
// L'adresse d'une autre personne est refusée dans le formulaire, avant que
// l'API ne la refuse : le message dit à qui elle est, et « Enregistrer »
// n'écrit rien. Une adresse inchangée n'est pas jugée.
// ---------------------------------------------------------------------------
const owners: Record<string, { firstName: string; lastName: string }> = {
  'henaut@example.fr': { firstName: 'Benjamin', lastName: 'Henaut' },
}
const addressOwner = (email: string) => owners[email.trim().toLowerCase()]

function open(email = 'sacha@example.fr') {
  const onSave = jest.fn()
  render(
    <ContactEditor
      title="Modifier"
      fields={['email', 'phone']}
      subject={{ email, phone: '' }}
      addressOwner={addressOwner}
      onSave={onSave}
      onClose={jest.fn()}
    />,
  )
  return onSave
}

describe('ContactEditor — une adresse, une personne', () => {
  it("says whose address it is, and saves nothing", () => {
    const onSave = open()
    fireEvent.changeText(screen.getByTestId('contact-edit-email'), 'Henaut@example.fr')
    expect(screen.getByTestId('contact-edit-email-taken').props.children)
      .toMatch(/^Cette adresse est déjà celle de Benjamin Henaut/)
    fireEvent.press(screen.getByTestId('contact-edit-save'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves an address of their own', () => {
    const onSave = open()
    fireEvent.changeText(screen.getByTestId('contact-edit-email'), 'sacha.h@example.fr')
    expect(screen.queryByTestId('contact-edit-email-taken')).toBeNull()
    fireEvent.press(screen.getByTestId('contact-edit-save'))
    expect(onSave).toHaveBeenCalledWith({ email: 'sacha.h@example.fr' })
  })

  it('does not judge an address left as it was — a pair the general admin has yet to settle', () => {
    const onSave = open('henaut@example.fr')
    fireEvent.changeText(screen.getByTestId('contact-edit-phone'), '0611')
    expect(screen.queryByTestId('contact-edit-email-taken')).toBeNull()
    fireEvent.press(screen.getByTestId('contact-edit-save'))
    expect(onSave).toHaveBeenCalledWith({ phone: '0611' })
  })
})
